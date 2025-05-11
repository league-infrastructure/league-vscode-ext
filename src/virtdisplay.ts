import * as vscode from 'vscode';

export let virtualDisplayTab: vscode.Tab | undefined;

export function activateVirtDisplay(context: vscode.ExtensionContext) {

    context.subscriptions.push(
        vscode.commands.registerCommand('jointheleague.openVirtualDisplay', async () => {
            let vncUrl = process.env.JTL_VNC_URL;

            if (!vncUrl && process.env.CODESPACE_NAME) {
                    vncUrl = `https://${process.env.CODESPACE_NAME}-6080.app.github.dev/`;
                    console.log(`Using codespace VNC URL: ${vncUrl}`);
            }

            if (!vncUrl) {
                console.log('VNC URL is not set, not opening virtual display.');
                return;
            }

            try {
                await vscode.commands.executeCommand('simpleBrowser.api.open', vncUrl, { 
                     label: 'Virtual Display' 
                });
                
                //await vscode.commands.executeCommand('simpleBrowser.api.open', vncUrl, { 
                //    viewColumn: vscode.ViewColumn.Beside, label: 'Virtual Display' 
                //});
              
                // Save reference to the opened tab
                const tabGroups = vscode.window.tabGroups.all;
                for (const tabGroup of tabGroups) {
                    for (const tab of tabGroup.tabs) {
                        if (tab.input instanceof vscode.TabInputWebview && tab.input.viewType === 'mainThreadWebview-simpleBrowser.view') {
                            virtualDisplayTab = tab;
                            break;
                        }
                    }
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to execute commands: ${error}`);
            }
        })
    );


    context.subscriptions.push(
        vscode.commands.registerCommand('jointheleague.openVirtualDisplayRight', async () => {
            await vscode.commands.executeCommand('jointheleague.openVirtualDisplay');
            await vscode.commands.executeCommand('workbench.action.moveEditorToRightGroup');
        })
    );


    context.subscriptions.push(
        vscode.commands.registerCommand('jointheleague.closeVirtualDisplay', async () => {
            try {
                if (virtualDisplayTab) {
                    await vscode.window.tabGroups.close(virtualDisplayTab);
                    virtualDisplayTab = undefined;
                } else {
                    console.log('No virtual display tab is open');
                }
            } catch {
                // prob b/c there is no open. 
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('jointheleague.toggleVirtualDisplay', async () => {
            if (virtualDisplayTab) {
                await vscode.commands.executeCommand('jointheleague.closeVirtualDisplay');
            } else {
                await vscode.commands.executeCommand('jointheleague.openVirtualDisplay');
            }
        })
    );
}

export function deactivate() {}