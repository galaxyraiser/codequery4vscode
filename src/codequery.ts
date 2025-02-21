'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { isNull } from 'util';
import {SRAggregator, SResult} from './srchresults';
import CQResultsProvider from './cqtreedataprov';

export default class CQSearch {

    private sra: SRAggregator;
    private cqrp: CQResultsProvider|undefined;
    private mytreeview: vscode.TreeView<SResult>|undefined;

    constructor() {
        this.sra = new SRAggregator;
        this.cqrp = undefined;
    }

    set treedataprov(dataprov: CQResultsProvider) {
        this.cqrp = dataprov;
    }

    get treedata() {
        return this.sra.treedata;
    }

    set treeview(tview: vscode.TreeView<SResult>) {
        this.mytreeview = tview;
    }

    private find_cqdb(rootpath: vscode.WorkspaceFolder): string {
        var dbpath1 = path.join(rootpath.uri.fsPath, 'cq.db');
        var dbpath2 = path.join(rootpath.uri.fsPath, '.vscode');
        dbpath2 = path.join(dbpath2, 'cq.db');
        var dbpath3 = path.join(rootpath.uri.fsPath, '.vscode');
        dbpath3 = path.join(dbpath3, 'codequery');
        dbpath3 = path.join(dbpath3, 'cq.db');
        if (fs.existsSync(dbpath1)) {
            return dbpath1;
        }
        else if (fs.existsSync(dbpath2)) {
            return dbpath2;
        }
        else if (fs.existsSync(dbpath3)) {
            return dbpath3;
        }
        return dbpath1;
    }

    private search(srchstring: string, srchtype: string, srchdescription: string, srchfrom: string, exact: boolean) {
        //console.log('Search for ' + srchstring + ' with search type ' + srchtype);
        if (srchstring.length === 0) {return;}
        if (vscode.workspace.workspaceFolders === undefined) {
            vscode.window.showInformationMessage('CodeQuery Error: Could not get rootpath');
            return;
        }
        const rootpath = vscode.workspace.workspaceFolders[0];
        var dbpath = this.find_cqdb(rootpath);
        if (!fs.existsSync(dbpath)) {
            vscode.window.showInformationMessage('CodeQuery Error: Could not find' + dbpath);
            return;
        }
        var exactstr : string;
        if (exact) {exactstr = '-e';}
        else {exactstr = '-f';}
        var cmd = `cqsearch -s ${dbpath} -p ${srchtype} -t ${srchstring} -l 0 ${exactstr} -u`;
        cp.exec(cmd, (err, stdout, stderr) => {
                if (isNull(err)) {
                    var numofresults = 0;
                    var lines = stdout.split("\n");
                    this.sra.reset();
                    for (var line of lines) {
                        var cols = line.split("\t");
                        if (cols.length === 3) {
                            this.searchResultsThreeColumns(cols);
                            numofresults++;
                        } else if (cols.length === 2) {
                            this.searchResultsTwoColumns(cols);
                            numofresults++;
                        }
                    }
                    var srchstring2 : string;
                    if (exact) { srchstring2 = '\x22' + srchstring + '\x22'; }
                    else { srchstring2 = srchstring; }
                    var item = this.sra.addSearchSummary(srchdescription, srchstring2, numofresults, srchfrom);
                    if (this.cqrp) {
                        this.cqrp.refresh();
                        if (this.mytreeview) {
                            this.mytreeview.reveal(item);
                        }
                    }
                }
                else {
                    vscode.window.showInformationMessage('CodeQuery Error: ' + stdout + "\n" + stderr);
                }
        });
    }

    private searchResultsThreeColumns(cols: string[]) {
        var stext = cols[0];
        var preview = cols[2];
        var fp = cols[1].split(":");
        if (fp.length === 3) { // Windows
            var s1 = fp.shift();
            var s2 = `${s1}:${fp[0]}`.replace(/\//g, "\\");
            fp[0] = s2;
        }
        if (fp.length === 2) {
            var fullpath = fp[0];
            var lineno = fp[1];
            var fn1 = fullpath.match(/([^\\\/]+)$/);
            var fn = fn1? fn1[0] : "";
            this.sra.addRecord(fn, fullpath, lineno, preview, stext);
        }
    }

    private searchResultsTwoColumns(cols: string[]) {
        var preview = cols[1];
        var fp = cols[0].split(":");
        if (fp.length === 3) { // Windows
            var s1 = fp.shift();
            var s2 = `${s1}:${fp[0]}`.replace(/\//g, "\\");
            fp[0] = s2;
        }
        if (fp.length === 2) {
            var stext = preview;
            var fullpath = fp[0];
            var lineno = fp[1];
            var fn1 = fullpath.match(/([^\\\/]+)$/);
            var fn = fn1? fn1[0] : "";
            this.sra.addRecord(fn, fullpath, lineno, preview, stext);
        }
    }

    private searchFromInputText(srchtype: string, titletext: string, srchtypetxt: string) {
        var input = vscode.window.createInputBox();
        input.title = titletext;
        input.prompt = 'Enter text to search; in quotes ("") for exact, or without, for fuzzy';
        input.enabled = true;
        input.busy = false;
        input.password = false;
        input.onDidHide(() => {input.dispose();});
        input.onDidAccept(async () => {
                var inputtext = input.value;
                input.dispose();
                inputtext = inputtext.trim();
                var srchstr = inputtext;
                var exact = false;
                if ((inputtext.length > 1) &&
                (((inputtext.charAt(0) === '\x27')&&(inputtext.charAt(inputtext.length - 1) === '\x27'))||
                ((inputtext.charAt(0) === '\x22')&&(inputtext.charAt(inputtext.length - 1) === '\x22'))))
                    {
                        srchstr = inputtext.replace(/[\x22|\x27]/g,'');
                        exact = true;
                    }
                this.search(srchstr, srchtype, srchtypetxt, 'inputbox', exact);
            }
        );
        input.show();
    }

    public showSearchOptions(srchtxt?: string|undefined, srchfrom?: string|undefined, exact?: boolean|undefined) {
        vscode.window.showQuickPick([
            '1: Symbol',
            '2: Function or macro definition',
            '3: Class or struct',
            '4: Files including this file',
            '6: Functions calling this function',
            '7: Functions called by this function',
            '8: Calls of this function or macro',
            '9: Members and methods of this class',
            '10: Class which owns this member or method',
            '11: Children of this class (inheritance)',
            '12: Parent of this class (inheritance)'
        ], {
            placeHolder: '1: Symbol',
        }).then( (result) => {
            if (result) {
                var result1 = result.split(':');
                if ((result1) && (result1.length === 2)) {
                    if (srchtxt) {
                        var sfrom: string;
                        if (srchfrom) {sfrom = srchfrom;}
                        else {sfrom = 'text selection';}
                        srchtxt = srchtxt.trim();
                        var srchstr = srchtxt;
                        if (exact === undefined)
                        {
                            if ((srchtxt.length > 1) &&
                            (((srchtxt.charAt(0) === '\x27')&&(srchtxt.charAt(srchtxt.length - 1) === '\x27'))||
                            ((srchtxt.charAt(0) === '\x22')&&(srchtxt.charAt(srchtxt.length - 1) === '\x22'))))
                                {
                                    srchstr = srchtxt.replace(/[\x22|\x27]/g,'');
                                    exact = true;
                                }
                            else {exact = false;}
                        }
                        this.search(srchstr, result1[0], result1[1], sfrom, exact);
                    } else {
                        this.searchFromInputText(result1[0], `CodeQuery Search:${result1[1]}`, result1[1]);
                    }
                }
            }
        });
    }

    public searchFromSelectedTextExact() {
        const editor = vscode.window.activeTextEditor;
        if (editor === undefined) {
            //console.log('CodeQuery Error: Could not get activeTexteditor');
            return;
        }
        var text = editor.document.getText(editor.selection);
        var srchstr = '\x22' + text + '\x22';
        this.showSearchOptions(srchstr);
    }

    public searchFromSelectedTextFuzzy() {
        const editor = vscode.window.activeTextEditor;
        if (editor === undefined) {
            //console.log('CodeQuery Error: Could not get activeTexteditor');
            return;
        }
        var text = editor.document.getText(editor.selection);
        this.showSearchOptions(text);
    }

}
