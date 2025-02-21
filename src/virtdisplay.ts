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
                await vscode.commands.executeCommand('simpleBrowser.api.open', vncUrl, { 
                    viewColumn: vscode.ViewColumn.Beside, label: 'Virtual Display' });
                await vscode.commands.executeCommand('workbench.action.moveEditorToRightGroup');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to execute commands: ${error}`);
            }
        })
    );

    
    context.subscriptions.push(
        vscode.commands.registerCommand('jointheleague.closeVirtualDisplay', async () => {
            try {
                const tabGroups = vscode.window.tabGroups.all;
                for (const tabGroup of tabGroups) {
                    for (const tab of tabGroup.tabs) {
                        //console.log("tab: ", tab.label, tab.input.viewType, tab);
                        if (tab.input instanceof vscode.TabInputWebview && tab.input.viewType === 'mainThreadWebview-simpleBrowser.view') {
                            await vscode.window.tabGroups.close(tab);
                            break;
                        }
                    }
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to close virtual display: ${error}`);
            }
        })
    );


    context.subscriptions.push(
        vscode.commands.registerCommand('jointheleague.toggleVirtualDisplay', async () => {
            const editors = vscode.window.visibleTextEditors;
            const isOpen = editors.some(editor => editor.document.uri.scheme === 'simple-browser');

            if (isOpen) {
                await vscode.commands.executeCommand('jointheleague.closeVirtualDisplay');
            } else {
                await vscode.commands.executeCommand('jointheleague.openVirtualDisplay');
            }
        })
    );

}

export function deactivate() {}