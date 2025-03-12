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


}

export function deactivate() {
    // Cleanup will be handled automatically through the disposables

    // Deactivate lesson browser
    deactivateLessonBrowser();
}

