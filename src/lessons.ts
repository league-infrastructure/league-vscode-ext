import * as vscode from 'vscode';
import { activateVirtDisplay } from './virtdisplay';
import { activateKeyRate } from './keystrokes';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

import { SyllabusProvider } from './SyllabusProvider';
import { SylFs, Syllabus } from './models';

class NoSyllabusError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NoSyllabusError';
    }
}




function setupFileWatcher(sylFs: SylFs, lessonProvider: SyllabusProvider, context: vscode.ExtensionContext): void {
    //
    // Watch the syllabus file for changes

    const watcher = fs.watch(sylFs.syllabusPath, (eventType) => {
        if (eventType === 'change') {
          
            lessonProvider.updateSyllabus(context);
            console.log('Syllabus file changed');
            setupFileWatcher(lessonProvider.sylFs, lessonProvider, context);
        }
    });

    context.subscriptions.push({ dispose: () => watcher.close() });

    // Watch for changes in configuration
    vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('jtl.syllabus.path') || e.affectsConfiguration('jtl.syllabus.preferEnv')) {
            lessonProvider.updateSyllabus(context);
            setupFileWatcher(lessonProvider.sylFs, lessonProvider, context);
        }
        
    });
}

function createTreeDP(context: vscode.ExtensionContext): SyllabusProvider | null {

    //
    // Create the Tree Data Provider


    const lessonProvider = new SyllabusProvider(context);

    setupFileWatcher(lessonProvider.sylFs, lessonProvider, context);

    return lessonProvider;
}

export async function activateLessonBrowser(context: vscode.ExtensionContext) {


    let lessonProvider = createTreeDP(context);

    if (!lessonProvider) {
        return;
    }


    /**
     * Reconfigure the views and settings to make the lesson browser simpler for students. 
     */

    await vscode.commands.executeCommand('workbench.view.extension.lessonBrowser');
    await vscode.commands.executeCommand('workbench.action.activityBarLocation.bottom');
    await vscode.workspace.getConfiguration('editor').update('minimap.enabled', false, true);


    // Unhide the activity bar when the extension is deactivated
    context.subscriptions.push({
        dispose: () => {
            vscode.workspace.getConfiguration('workbench').update('activityBar.visible', true, true);
            vscode.workspace.getConfiguration('editor').update('minimap.enabled', true, true);
            vscode.commands.executeCommand('workbench.action.activityBarLocation.default');
        }
    });

    console.log('Lesson browser activated');
}

export function deactivateLessonBrowser() {
    console.log('Lesson browser deactivated');
}

