import * as vscode from 'vscode';
import { activateVirtDisplay } from './virtdisplay';
import { activateKeyRate } from './keystrokes';
import { activateLessonBrowser, deactivateLessonBrowser } from './lessons';
import { activateJupyterDefault } from './jupykernel';
import { activateActions } from './actions';

export async function activate(context: vscode.ExtensionContext) {
    // Initialize browser feature
    activateVirtDisplay(context);

     // Initialize lesson browser
    activateLessonBrowser(context).then((syllabusProvider) => {
        // Initialize keystroke monitoring with syllabus provider
        activateKeyRate(context, syllabusProvider);
    });

    // Initialize Jupyter kernel
    activateJupyterDefault(context);

    // Initialize actions
    activateActions(context);

    vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('jtl.lesson_browser')) {
            vscode.window.showInformationMessage(
                'Configuration for Lesson Browser has changed. Please reload the window for changes to take effect.',
                'Reload'
            ).then((selection) => {
                if (selection === 'Reload') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            });
        }
    });
}

export function deactivate() {
    // Cleanup will be handled automatically through the disposables

    // Deactivate lesson browser
    deactivateLessonBrowser();
}

