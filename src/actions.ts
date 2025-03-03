/*
* A Webview to display action buttons. 
 */

import * as vscode from 'vscode';

// Create a WebviewViewProvider class
class LessonActionsViewProvider implements vscode.WebviewViewProvider {
    constructor(private readonly _extensionUri: vscode.Uri) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this.getWebviewContent();

        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'toggleCompletion':
                        vscode.commands.executeCommand('lessonBrowser.toggleCompletion');
                        return;
                }
            }
        );
    }

	private getWebviewContent(): string {
		const codeServerUrl = process.env.CODESERVER_URL || 'https://jointheleague.org';
		const stopServerUrl = process.env.CODESERVER_STOP_URL || 'https://jointheleague.org';

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
						background-color: #4CAF50; /* Green color */
						color: white;
						border: none;
						border-radius: 4px;
						cursor: pointer;
						font-weight: bold;
					}
					#doneButton:hover {
						background-color: #45a049; /* Darker green on hover */
					}

					#codeServerButton, #stopServerButton {
						width: 48%;
						height: 30px;
						padding: 4px 8px;
						margin: 0;
						border: 2px solid blue;
						color: blue;
						background-color: white;
						border-radius: 4px;
						cursor: pointer;
						font-weight: bold;
					}
					#codeServerButton:hover, #stopServerButton:hover {
						background-color: #f0f0f0;
					}
					#buttonContainer {
						display: flex;
						justify-content: space-between;
						width: 100%;
					}
					.icon-space {
						margin-right: 5px;
					}
					.fa-ban {
						color: red;
					}
					.fa-external-link-alt {
						color: blue;
					}
				</style>
			</head>
			<body>
				<button id="doneButton">Next Lesson</button>
				<div id="buttonContainer">
					<button id="codeServerButton" onclick="window.location.href='${codeServerUrl}'">
						<i class="fas fa-external-link-alt icon-space"></i>Code Server App
					</button>
					<button id="stopServerButton" onclick="window.location.href='${stopServerUrl}'">
						<i class="fas fa-ban icon-space"></i>Stop Server
					</button>
				</div>
				<script>
					const vscode = acquireVsCodeApi();
					document.getElementById('doneButton').addEventListener('click', () => {
						vscode.postMessage({ command: 'toggleCompletion' });
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