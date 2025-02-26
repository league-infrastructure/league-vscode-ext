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
		return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Actions</title>
				<style>
					body {
						padding: 5px;
						display: flex;
						justify-content: center;
						overflow: hidden;
						margin: 0;
						min-height: unset;
						height: auto;
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
					html, body {
						height: 100px; /* Set a fixed height for the content */
					}
				</style>
			</head>
			<body>
				<button id="doneButton">Next Lesson</button>
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