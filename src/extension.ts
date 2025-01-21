import * as vscode from 'vscode';
import { activateVirtDisplay } from './virtdisplay';
import { activateKeyRate } from './keystrokes';

export function activate(context: vscode.ExtensionContext) {
    // Initialize browser feature
    activateVirtDisplay(context);

    // Initialize keystroke monitoring
    activateKeyRate(context);
}

export function deactivate() {
    // Cleanup will be handled automatically through the disposables
}