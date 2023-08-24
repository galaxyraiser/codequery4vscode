'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import {SResult} from './srchresults';
import CQSearch from './codequery';

export default class CQResultsProvider implements vscode.TreeDataProvider<SResult> {

	private _onDidChangeTreeData: vscode.EventEmitter<SResult | undefined> = new vscode.EventEmitter<SResult | undefined>();
	readonly onDidChangeTreeData: vscode.Event<SResult | undefined> = this._onDidChangeTreeData.event;
	private workspaceRoot: string|undefined;
	private node: SResult|undefined;

	constructor(public cq: CQSearch) {
        if (vscode.workspace.workspaceFolders === undefined) {
            vscode.window.showInformationMessage('CodeQuery Error: Could not get rootpath');
            this.workspaceRoot = undefined;
        } else {
            this.workspaceRoot = vscode.workspace.workspaceFolders[0].name;
		}
    }

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	openfile(uri: string) {
		var uriparts = uri.split("\t");
		if (uriparts.length === 2) {
			var fileuri = uriparts[0];
			var linenumStr = uriparts[1];
			if (!fs.existsSync(fileuri)) {
				var fn1 = fileuri.match(/([^\\\/]+)$/);
				var fn = fn1 ? fn1[0] : fileuri;
				vscode.window.showInformationMessage('CodeQuery Error: Could not find ' + fn);
				return;
			}
			vscode.workspace.openTextDocument(fileuri).then(doc => {
				vscode.window.showTextDocument(doc).then(editor => {
					var linenum = parseInt(linenumStr, 10);
					var position = new vscode.Position(linenum - 1, linenum - 1);
					// Line added - by having a selection at the same position twice, the cursor jumps there
					editor.selections = [new vscode.Selection(position, position)];

					// And the visible range jumps there too
					var remaining = editor.document.lineCount - linenum;
					editor.revealRange(this.calcRange(linenum, remaining, editor.document.lineCount - 1));
				});
			  });
		}
	}

	private calcRange(linenum1: number, remaining: number, total: number): vscode.Range {
		var upperLine = linenum1 - 1;
		var lowerLine = linenum1 - 1;

		if (remaining >= 20) {
			lowerLine += 20;
		}
		else {
			lowerLine = total;
		}

		if (linenum1 >= 10) {
			upperLine -= 10;
		}
		else {
			upperLine = 1;
		}

		//vscode.window.showInformationMessage('Line: ' + linenum1 + 'L: ' + lowerLine + 'U: ' + upperLine);
		var pos1 = new vscode.Position(upperLine, 0);
		var pos2 = new vscode.Position(lowerLine, 0);
		var range = new vscode.Range(pos1, pos2);
		return range;
	}

	getTreeItem(element: SResult): vscode.TreeItem {
		return element;
	}

	getChildren(element?: SResult): Thenable<SResult[]> {
		if (!this.workspaceRoot) {
			vscode.window.showInformationMessage('No SResult in empty workspace');
			return Promise.resolve([]);
        }
        
		if (element) {
			return Promise.resolve(element.children);
		} else {
			return Promise.resolve(this.cq.treedata);
		}
	}

	getParent(element: SResult): Thenable<SResult|null|undefined> {
		return Promise.resolve(element.parent);
	}

}

