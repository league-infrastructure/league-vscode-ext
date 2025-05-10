import * as vscode from 'vscode';

export let virtualDisplayTab: vscode.Tab | undefined;

export function activateVirtDisplay(context: vscode.ExtensionContext) {

    context.subscriptions.push(
        vscode.commands.registerCommand('jointheleague.openVirtualDisplay', async () => {
            let vncUrl = process.env.JTL_VNC_URL;

            if (!vncUrl) {
                // Check if running in codespace and create URL based on CODESPACE_NAME
                if (process.env.CODESPACE_NAME) {
                    vncUrl = `https://${process.env.CODESPACE_NAME}-6080.app.github.dev/`;
                    console.log(`Using codespace VNC URL: ${vncUrl}`);
                } else {
                    // If by line 23 we still don't have a vncUrl, use the configured default
                    const config = vscode.workspace.getConfiguration('jtl.lesson_browser.virtual_display');
                    vncUrl = config.get('default_url') as string || 'https://zombo.com/';
                    console.log(`Using default VNC URL from configuration: ${vncUrl}`);
                }
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
            } catch (error) {
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