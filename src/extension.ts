import * as vscode from 'vscode';
import { activateVirtDisplay } from './virtdisplay';
import { activateKeyRate } from './keystrokes';
import { activateLessonBrowser, deactivateLessonBrowser, simplifyUI, defaultUI } from './lessons';
import { activateJupyterDefault } from './jupykernel';
import { activateActions } from './actions';

import { hideFiles, unhideFiles } from './workspaceSettings';

export async function activate(context: vscode.ExtensionContext) {
    // Register UI commands
    context.subscriptions.push(
        vscode.commands.registerCommand('jtl-syllabus.simplifyUI', simplifyUI),
        vscode.commands.registerCommand('jtl-syllabus.defaultUI', defaultUI),
        vscode.commands.registerCommand('jtl-syllabus.hideFiles', hideFiles),
        vscode.commands.registerCommand('jtl-syllabus.unhideFiles', unhideFiles)
    );

    // Initialize browser feature
    activateVirtDisplay(context);

    try {
        // Initialize lesson browser first and await its completion
        const syllabusProvider = await activateLessonBrowser(context);
        
        // Only initialize keystroke monitoring after we have a valid syllabusProvider
        activateKeyRate(context, syllabusProvider);
        
        // Initialize Jupyter kernel
        activateJupyterDefault(context);
        
        // Initialize actions
        activateActions(context);
        
    } catch (error) {
        console.error('Failed to initialize lesson browser:', error);
        vscode.window.showErrorMessage(`Failed to initialize lesson browser: ${error instanceof Error ? error.message : String(error)}`);
    }

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
    deactivateLessonBrowser();
}

