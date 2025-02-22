import * as vscode from 'vscode';
import { activateVirtDisplay } from './virtdisplay';
import { activateKeyRate } from './keystrokes';
import { activateLessonBrowser, deactivateLessonBrowser } from './lessons';

export async function activate(context: vscode.ExtensionContext) {
    // Initialize browser feature
    activateVirtDisplay(context);

    // Initialize keystroke monitoring
    activateKeyRate(context);

     // Initialize lesson browser
    activateLessonBrowser(context);

}

export function deactivate() {
    // Cleanup will be handled automatically through the disposables

    // Deactivate lesson browser
    deactivateLessonBrowser();
}