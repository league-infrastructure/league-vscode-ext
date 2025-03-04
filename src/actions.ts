/*
* A Webview to display action buttons. 
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Create a WebviewViewProvider class
class LessonActionsViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    
    constructor(private readonly _extensionUri: vscode.Uri) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;
        
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this.getWebviewContent();

        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'setCompletion':
                        vscode.commands.executeCommand('lessonBrowser.setCompletion');
                        return;
                    case 'runPython':
                        this.runFirstLaunchConfiguration();
                        return;
                    case 'stopProgram':
                        this.stopProgramAndSwitchView();
                        return;
                    case 'checkPythonFile':
                        this.checkPythonFile();
                        return;
                }
            }
        );
        
        // Initial Python file check
        this.checkPythonFile();
        
        // Listen for changes in editors (both active and visible)
        vscode.Disposable.from(
            vscode.window.onDidChangeActiveTextEditor(() => {
                this.checkPythonFile();
            }),
            vscode.window.onDidChangeVisibleTextEditors(() => {
                this.checkPythonFile();
            })
        );
    }

    /**
     * Checks if there's any Python file open and updates the Webview
     */
    private checkPythonFile() {
        if (!this._view) return;
        
        // Check all visible editors, not just the active one
        const hasPythonFile = vscode.window.visibleTextEditors.some(
            editor => editor.document.languageId === 'python'
        );
        
        // Send message back to the Webview
        this._view.webview.postMessage({ 
            command: 'updatePythonFileStatus', 
            isPythonFile: hasPythonFile
        });
    }

    /**
     * Runs the first launch configuration found in launch.json
     */
    private async runFirstLaunchConfiguration() {
        try {
            // Check if there's an active editor first
            if (!vscode.window.activeTextEditor) {
                await this.openDefaultEditorFile();
            }
            
            // Get all launch configurations
			const launchConfigs = vscode.workspace.getConfiguration('launch').configurations;
            
            // If there are launch configurations available, use the first one
            if (launchConfigs && launchConfigs.length > 0) {
                // Check for ${file} variable in the configuration and validate it
                const config = launchConfigs[0];
                
                // If the config uses ${file} and there's still no active editor, show a helpful message
                if (JSON.stringify(config).includes('${file}') && !vscode.window.activeTextEditor) {
					const firstEditor = vscode.window.visibleTextEditors[0];
					if (firstEditor) {
						await vscode.window.showTextDocument(firstEditor.document);
                        await this.startDebuggingAndKeepFocus(undefined, config);
					} else {
						vscode.window.showErrorMessage('No editor window is open to run the program.');
					}
	
                    return;
                }
                
                // Start debugging with the first configuration
                await this.startDebuggingAndKeepFocus(undefined, config);
            } else {
                // Fallback to the default debug start command if no configurations are found
                // Only if there's an active editor
                if (vscode.window.activeTextEditor) {
                    await this.startDebuggingWithDefaultAndKeepFocus();
                } else {
					const firstEditor = vscode.window.visibleTextEditors[0];
					if (firstEditor) {
						await vscode.window.showTextDocument(firstEditor.document);
                        await this.startDebuggingWithDefaultAndKeepFocus();
					} else {
						vscode.window.showErrorMessage('No editor window is open to run the program.');
					}
                }
            }
        } catch (error) {
            // Show a more helpful error message
            console.error('Debug start error:', error);
            vscode.window.showErrorMessage('Could not start debugging. Please make sure a file is open.');
        }
    }

    /**
     * Starts debugging with a configuration and prevents focus switching
     */
    private async startDebuggingAndKeepFocus(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration): Promise<boolean> {
        // Start the debugging
        const result = await vscode.debug.startDebugging(folder, config);
        
        // If successful, restore focus to the lesson browser view after a short delay
        if (result) {
            setTimeout(() => {
                this.restoreViewFocus('lessonBrowserView');
            }, 300); // Increased timeout to give VS Code more time to switch views
        }
        
        return result;
    }

    /**
     * Uses the default debug start command and keeps focus
     */
    private async startDebuggingWithDefaultAndKeepFocus(): Promise<void> {
        // Start debugging with the default command
        await vscode.commands.executeCommand('workbench.action.debug.start');
        
        // Restore focus to the lesson browser view after a short delay
        setTimeout(() => {
            this.restoreViewFocus('lessonBrowserView');
        }, 300); // Increased timeout to give VS Code more time to switch views
    }

    /**
     * Gets the active view ID
     */
    private async getActiveViewId(): Promise<string | undefined> {
        // This method isn't needed anymore since we're just using the known view ID
        return 'lessonBrowserView';
    }

    /**
     * Restores focus to a specific view
     */
    private async restoreViewFocus(viewId: string): Promise<void> {
        try {
            // Focus on our lesson browser view - using the correct view ID
            // The error shows 'lessonBrowserView' is the correct ID, not 'workbench.view.extension.lessonBrowserView'
            await vscode.commands.executeCommand('lessonBrowserView.focus');
        } catch (error) {
            console.error('Error restoring view focus:', error);
        }
    }

    /**
     * Attempts to open a file in the workspace to satisfy the ${file} variable
     */
    private async openDefaultEditorFile() {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return;
            }
            
            // Look for Python files in the workspace
            const rootPath = workspaceFolders[0].uri.fsPath;
            
            // Try to find a main.py or any Python file
            const mainPaths = ['main.py', 'app.py', 'index.py'];
            
            for (const mainFile of mainPaths) {
                const filePath = path.join(rootPath, mainFile);
                if (fs.existsSync(filePath)) {
                    const doc = await vscode.workspace.openTextDocument(filePath);
                    await vscode.window.showTextDocument(doc);
                    return;
                }
            }
            
            // If no specific main files found, try to find any Python file
            const files = await vscode.workspace.findFiles('**/*.py', '**/node_modules/**', 1);
            if (files.length > 0) {
                const doc = await vscode.workspace.openTextDocument(files[0]);
                await vscode.window.showTextDocument(doc);
            }
        } catch (error) {
            console.error('Failed to open default file:', error);
        }
    }

    /**
     * Stops the running program and switches back to the lessonBrowser Lessons view
     */
    private async stopProgramAndSwitchView() {
        // Stop any debugging session
        await vscode.commands.executeCommand('workbench.action.debug.stop');
        
        // Switch focus to the lessonBrowserView
        await vscode.commands.executeCommand('lessonBrowserView.focus');
    }

	private getWebviewContent(): string {
		return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Actions</title>
				<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
				<style>
					body {
						padding: 5px;
						display: flex;
						flex-direction: column;
						justify-content: space-between;
						overflow: hidden;
						margin: 0;
						min-height: unset;
						height: 100px; /* Set a fixed height for the content */
					}

					#doneButton {
						width: 100%;
						height: 30px;
						padding: 4px 8px;
						margin: 0;
						background-color: #007acc; /* Changed from green to blue */
						color: white;
						border: none;
						border-radius: 4px;
						cursor: pointer;
						font-weight: bold;
					}
					#doneButton:hover {
						background-color: #005fa3; /* Darker blue on hover */
					}

					#runButton, #stopButton {
						width: 48%;
						height: 30px;
						padding: 4px 8px;
						margin: 0;
						border-radius: 4px;
						cursor: pointer;
						font-weight: bold;
					}
					#runButton {
						background-color: #4CAF50; /* Changed from blue to green */
						color: white;
						border: none;
					}
					#runButton:hover {
						background-color: #45a049; /* Darker green on hover */
					}
					#stopButton {
						background-color: #d9534f; /* Red color unchanged */
						color: white;
						border: none;
					}
					#stopButton:hover {
						background-color: #c9302c; /* Darker red on hover */
					}
					#buttonContainer {
						display: flex;
						justify-content: space-between;
						width: 100%;
					}
					.icon-space {
						margin-right: 5px;
					}
					.fa-play {
						color: white;
					}
					.fa-stop {
						color: white;
					}
				</style>
			</head>
			<body>
				<button id="doneButton">Next Lesson</button>
				<div id="buttonContainer" style="display: none;">
					<button id="runButton">
						<i class="fas fa-play icon-space"></i>Run
					</button>
					<button id="stopButton">
						<i class="fas fa-stop icon-space"></i>Stop
					</button>
				</div>
				<script>
					const vscode = acquireVsCodeApi();
					
					document.getElementById('doneButton').addEventListener('click', () => {
						vscode.postMessage({ command: 'setCompletion' });
					});
					
					document.getElementById('runButton').addEventListener('click', () => {
						vscode.postMessage({ command: 'runPython' });
					});
					
					document.getElementById('stopButton').addEventListener('click', () => {
						vscode.postMessage({ command: 'stopProgram' });
					});

					 // Request an initial check for Python files
					vscode.postMessage({ command: 'checkPythonFile' });

					// Handle messages sent from the extension to the webview
					window.addEventListener('message', event => {
						const message = event.data;
						
						switch (message.command) {
							case 'updatePythonFileStatus':
								// Show or hide the run buttons based on whether there's a Python file open
								document.getElementById('buttonContainer').style.display = 
									message.isPythonFile ? 'flex' : 'none';
								break;
						}
					});
				</script>
			</body>
			</html>
		`;
	}
}

export function activateActions(context: vscode.ExtensionContext) {
    // Register the WebView provider for the sidebar
    const provider = new LessonActionsViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('lessonActionsView', provider)
    );

    // Keep the command for backward compatibility or alternative opening
    const openActionsPanelCommand = vscode.commands.registerCommand('lessonBrowser.openActionsPanel', () => {
        vscode.commands.executeCommand('lessonActionsView.focus');
    });
    context.subscriptions.push(openActionsPanelCommand);
}