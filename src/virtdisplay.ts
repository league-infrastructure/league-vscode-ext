import * as vscode from 'vscode';


export function activateVirtDisplay(context: vscode.ExtensionContext) {

    console.log('Installing the virtual display to url: ' + process.env.VNC_URL);

    context.subscriptions.push(
        vscode.commands.registerCommand('jointheleague.openVirtualDisplay', async () => {
            // Get the VNC_URL from environment variables
            const vncUrl = process.env.VNC_URL;

            // Check if VNC_URL is defined
            if (!vncUrl) {
                vscode.window.showErrorMessage('VNC_URL environment variable is not set');
                return;
            }

            vscode.window.showInformationMessage('Open virtual display: ' + process.env.VNC_URL);

            try {
                // Execute sequence of commands
                //await vscode.commands.executeCommand('workbench.action.splitEditorRight');
                await vscode.commands.executeCommand('simpleBrowser.api.open', vncUrl);
                await vscode.commands.executeCommand('workbench.action.moveEditorToRightGroup');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to execute commands: ${error}`);
            }
        })
    );
}

// Optional: Deactivate function if you need cleanup
export function deactivate() {}