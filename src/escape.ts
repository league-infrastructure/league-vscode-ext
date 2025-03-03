import * as vscode from 'vscode';

export function activateEscape(context: vscode.ExtensionContext) {
    const redirectToPageCommand = vscode.commands.registerCommand('jointheleague.redirectToPage', () => {
        vscode.env.openExternal(vscode.Uri.parse('https://example.com'));
    });

    context.subscriptions.push(redirectToPageCommand);
}
