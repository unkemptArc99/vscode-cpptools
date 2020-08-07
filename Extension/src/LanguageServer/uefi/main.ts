/**
 * Handling UEFI Context. This file provides definitions for UEFI meta files.
**/
'use strict';

import * as vscode from 'vscode';

const PcdPattern: RegExp = /\b\w+\.(Pcd\w+)[\ ]*\|.+\b/g;

const pcdStore: Map<string, vscode.Location> = new Map();

class PcdDefinitionProvider implements vscode.DefinitionProvider {
    public provideDefinition (
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Location> {
        const wordRange: vscode.Range|undefined = document.getWordRangeAtPosition(position);
        if (wordRange) {
            const searchStr: string = document.getText(wordRange);
            const regexMatchArr: RegExpMatchArray|null = searchStr.match(/Pcd\w+/g);
            if (regexMatchArr && regexMatchArr.length > 0) {
                console.log(regexMatchArr[0]);
                const strLoc: vscode.Location|undefined = pcdStore.get(regexMatchArr[0]);
                if (strLoc) {
                    return strLoc;
                }
            }
        }
        return new Promise((reject) => {
            new Error("Definiton not found");
        });
    }
}

export class UefiContext {
    private decFileWatcher: vscode.FileSystemWatcher;

    constructor() {
        this.parseDecContent();

        this.decFileWatcher = vscode.workspace.createFileSystemWatcher ("**/*.dec");
	    this.decFileWatcher.onDidChange(event => this.refreshPcdStore(event, 1));
	    this.decFileWatcher.onDidCreate(event => this.refreshPcdStore(event, 2));
        this.decFileWatcher.onDidDelete(event => this.refreshPcdStore(event, 3));
    }

    private parseFileForExp(fileName: vscode.Uri, pattern: RegExp): Map<string, vscode.Location> {
        // Open the file for processing
        const result: Map<string, vscode.Location> = new Map();
        vscode.workspace.openTextDocument(fileName).then((fileContent) => {
            const textContent: string = fileContent.getText();
            // Pattern which searches Pcd declaration
            let matchArr: RegExpExecArray|null;
            while ((matchArr = pattern.exec(textContent)) !== null) {
                // Start and End positions of the location of the definiton of Pcd.
                const endPos: vscode.Position = fileContent.positionAt(pattern.lastIndex);
                const startPos: vscode.Position = fileContent.positionAt(pattern.lastIndex - matchArr[0].length);
                // Storing the Pcd in the map for better complexity on finding definitions.
                result.set(matchArr[1], new vscode.Location(fileName, new vscode.Range(startPos, endPos)));
            }
        });
        return result;
    }

    private parseDecContent (): void {
        vscode.workspace.findFiles("**/*.dec").then(decFiles => {
            decFiles.forEach ((decFile) => {
                const pcdResults: Map<string, vscode.Location> = this.parseFileForExp(decFile, PcdPattern);
                pcdResults.forEach((value, key, map) => {
                    pcdStore.set(key, value);
                });
            });
        });
    }

    private refreshPcdStore(fileName: vscode.Uri, eventType: number): void {
        if (eventType === 1) {
            const pcdResult: Map<string, vscode.Location> = this.parseFileForExp(fileName, PcdPattern);
            pcdStore.forEach((value, key, map) => {
                if (value.uri === fileName) {
                    const loc: vscode.Location|undefined = pcdResult.get(key);
                    if (loc === undefined) {
                        pcdStore.delete(key);
                    }
                }
            });
            pcdResult.forEach((value, key, map) => {
                pcdStore.set(key, value);
            });
        } else if (eventType === 2) {
            this.parseFileForExp(fileName, PcdPattern);
        } else if (eventType === 3) {
            pcdStore.forEach((value, key, map) => {
                if (value.uri === fileName) {
                    pcdStore.delete(key);
                }
            });
        }
    }

    public registerDefinitions(): vscode.Disposable[] {
        const disposables: vscode.Disposable[] = [];

        disposables.push(vscode.languages.registerDefinitionProvider('c', new PcdDefinitionProvider()));
        disposables.push(vscode.languages.registerDefinitionProvider('dsc', new PcdDefinitionProvider()));
        disposables.push(vscode.languages.registerDefinitionProvider('fdf', new PcdDefinitionProvider()));

        return disposables;
    }
}
