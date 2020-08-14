/**
 * UEFI support.
 * Current features -
 * 1. Code highlighting for INF, DEC, DSC and FDF files.
 * 2. Definitions of PCDs
**/
'use strict';

import * as vscode from 'vscode';
import { CompletionItemKind } from 'vscode-languageclient';

const PcdPattern: RegExp = /\b\w+\.(Pcd\w+)[\ ]*\|.+\b/g;

const pcdStore: Map<string, vscode.Location> = new Map();

// interface InfInfo {
//     infFilePath: string;
//     componentType: boolean;     // 0 for Library Class, 1 for Driver
//     componentName: string;      // The name of the component. For eg. BaseLib, GpioRuntimeDxe, etc.
//     phase: string;              // Determine phase - PEI, SEC, DXE, etc.
//     sourceFiles: string[];
// }

// interface PkgInfo {
//     pkgFolderPath: string;
//     componentList: InfInfo[];
// }

// interface LibClassInfo {
//     libClassName: string;
//     infFilePath: string;
// }

// interface ProjectInfo {
//     dscFilePath: string;
//     fdfFilePath: string;
//     libClasses: LibClassInfo[];
//     componentList: string[];
// }
// interface WorkspaceInfo {
//     workspacePath: string;
//     PackageList: PkgInfo[];
//     ProjectList: ProjectInfo[];
// }

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
                console.log(strLoc);
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

class PcdCompletionProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems (
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CompletionItem[]> {
        const wordRange: vscode.Range|undefined = document.getWordRangeAtPosition(position);
        const completionResult: vscode.CompletionItem[] = [];
        if (wordRange) {
            const searchStr: string = document.getText(wordRange);
            const regexMatchArr: RegExpMatchArray|null = searchStr.match(/Pcd\w*/g);
            if (regexMatchArr) {
                for (const entry of Array.from(pcdStore.keys())) {
                    if (entry.match(regexMatchArr[0])) {
                        completionResult.push(new vscode.CompletionItem(entry, CompletionItemKind.Constant));
                    }
                }
            }
        }
        return completionResult;
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

    private async parseFileForExp(fileName: vscode.Uri, pattern: RegExp): Promise<Map<string, vscode.Location>> {
        // Open the file for processing
        const result: Map<string, vscode.Location> = new Map();
        return vscode.workspace.openTextDocument(fileName).then((fileContent) => {
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
            return result;
        });
    }

    private async parseDecContent (): Promise<void> {
        vscode.workspace.findFiles("**/*.dec").then(decFiles => {
            decFiles.forEach ((decFile) => {
                this.parseFileForExp(decFile, PcdPattern).then((pcdResults) => {
                    pcdResults.forEach((value, key, map) => {
                        pcdStore.set(key, value);
                    });
                });
            });
        });
    }

    private async refreshPcdStore(fileName: vscode.Uri, eventType: number): Promise<void> {
        console.log(fileName.path + " " + eventType);
        if (eventType === 1) {
            this.parseFileForExp(fileName, PcdPattern).then((pcdResults) => {
                pcdStore.forEach((value, key, map) => {
                    if (value.uri.path === fileName.path) {
                        const loc: vscode.Location|undefined = pcdResults.get(key);
                        if (loc === undefined) {
                            pcdStore.delete(key);
                        }
                    }
                });
                pcdResults.forEach((value, key, map) => {
                    pcdStore.set(key, value);
                });
            });
        } else if (eventType === 2) {
            this.parseFileForExp(fileName, PcdPattern).then((pcdResults) => {
                pcdResults.forEach((value, key, map) => {
                    pcdStore.set(key, value);
                });
            });
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
        disposables.push(vscode.languages.registerDefinitionProvider('inf', new PcdDefinitionProvider()));

        disposables.push(vscode.languages.registerCompletionItemProvider('c', new PcdCompletionProvider()));
        disposables.push(vscode.languages.registerCompletionItemProvider('dec', new PcdCompletionProvider()));
        disposables.push(vscode.languages.registerCompletionItemProvider('dsc', new PcdCompletionProvider()));
        disposables.push(vscode.languages.registerCompletionItemProvider('inf', new PcdCompletionProvider()));

        return disposables;
    }
}
