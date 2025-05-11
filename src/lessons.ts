import * as vscode from 'vscode';
import * as fs from 'fs';


import { SyllabusProvider } from './SyllabusProvider';
import { SylFs  } from './models';
import { hideFiles, unhideFiles } from './workspace-settings';



/**
 * Simplifies the UI for students by moving the activity bar to the bottom,
 * disabling the minimap, and focusing on the lesson browser.
 */
export async function simplifyUI() {
    await vscode.commands.executeCommand('workbench.view.extension.lessonBrowser');
    await vscode.commands.executeCommand('workbench.action.activityBarLocation.bottom');
    await vscode.workspace.getConfiguration('editor').update('minimap.enabled', false, true);
}

/**
 * Restores the UI to default settings by moving the activity bar to its default position,
 * enabling the minimap, and showing the activity bar.
 */
export async function defaultUI() {
    // Enable the minimap
    await vscode.workspace.getConfiguration('editor').update('minimap.enabled', true, true);
    
    // Move activity bar back to default position
    await vscode.commands.executeCommand('workbench.action.activityBarLocation.default');
    
    // VS Code doesn't have a direct configuration for activityBar.visible,
    // so we need to use the command to show the activity bar if it's hidden
    await vscode.commands.executeCommand('workbench.action.toggleActivityBarVisibility', true);
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

}

function createTreeDP(context: vscode.ExtensionContext): SyllabusProvider {

    //
    // Create the Tree Data Provider


    const lessonProvider = new SyllabusProvider(context);

    setupFileWatcher(lessonProvider.sylFs, lessonProvider, context);

    return lessonProvider;
}
export function activateLessonBrowser(context: vscode.ExtensionContext): Thenable<SyllabusProvider> {
    return new Promise((resolve, reject) => {
        (async () => {
            try {
                const lessonProvider: SyllabusProvider = createTreeDP(context);

                const config = vscode.workspace.getConfiguration('jtl.lesson_browser');
                const isDevMode = config.get<boolean>('dev', false) || (process.env.JTL_SYLLABUS_DEV && process.env.JTL_SYLLABUS_DEV !== '');
                context.globalState.update('jtl.syllabus.isDevMode', isDevMode);


                if (!isDevMode) {
                    /**
                     * Reconfigure the views and settings to make the lesson browser simpler for students. 
                     */
                    await simplifyUI();
                    
                    // Hide system files and other files that would distract students
                    await hideFiles();

                    // Restore default UI settings when the extension is deactivated
                    context.subscriptions.push({
                        dispose: () => {
                            defaultUI();
                            unhideFiles();
                        }
                    });
                }

                console.log('Lesson browser activated');
                resolve(lessonProvider);
            } catch (error) {
                reject(error);
            }
        })();
    });
}


export function deactivateLessonBrowser() {
    console.log('Lesson browser deactivated');
}

