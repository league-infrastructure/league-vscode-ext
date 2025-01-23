import * as vscode from 'vscode';


export function activateVirtDisplay(context: vscode.ExtensionContext) {


    context.subscriptions.push(
        vscode.commands.registerCommand('jointheleague.openVirtualDisplay', async () => {
 
            const vncUrl = process.env.VNC_URL;

            if (!vncUrl) {
                vscode.window.showErrorMessage('VNC_URL environment variable is not set');
                return;
            }

            try {
                await vscode.commands.executeCommand('simpleBrowser.api.open', vncUrl);
                await vscode.commands.executeCommand('workbench.action.moveEditorToRightGroup');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to execute commands: ${error}`);
            }
        })
    );
}

export function deactivate() {}