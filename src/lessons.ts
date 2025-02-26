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

function loadSyllabus(context: vscode.ExtensionContext) : Syllabus | false {

    //
    // Load the Syllabus file from either the env var or the config

    const jtlSyllabusConfig = vscode.workspace.getConfiguration('jtl').get<string>('syllabus.path');
    const jtlSyllabusEnv = process.env.JTL_SYLLABUS;

    // determine which value to prefer
    let jtlSyllabus;

    const pref = vscode.workspace.getConfiguration('jtl').get<boolean>('syllabus.preferEnv');
    if (pref){
        jtlSyllabus = jtlSyllabusEnv || jtlSyllabusConfig ;      
    } else {
        jtlSyllabus = jtlSyllabusConfig || jtlSyllabusEnv;
    }

    if (!jtlSyllabus) {
        //throw new NoSyllabusError('JTL_SYLLABUS environment variable or configuration is not set.');
        return false
    }

    const syllabusPath = path.isAbsolute(jtlSyllabus) ? jtlSyllabus : path.join(context.extensionPath, jtlSyllabus);
    if (!fs.existsSync(syllabusPath)) {
        throw  vscode.FileSystemError.FileNotFound(`Course file not found at path: ${syllabusPath}`);
    }

    //
    // Load the Syllabus Data
    // 

    console.log('Loading syllabus from:', syllabusPath);

    let syllabus = yaml.load(fs.readFileSync(syllabusPath, 'utf8')) as Syllabus;

    // Check if the syllabus is in the correct format
    if (!syllabus.modules || !Array.isArray(syllabus.modules) || syllabus.modules.length === 0 || !syllabus.modules[0].lessons || !syllabus.modules[0].lessons[0].name) {
        throw Error(`Invalid syllabus format in file ${syllabusPath}`);
    }


    syllabus.filePath = syllabusPath;

    return syllabus;

}



function setupFs(syllabus: Syllabus, context: vscode.ExtensionContext) : SylFs {

    let syllabusPath = syllabus.filePath;
    
    if (!syllabusPath) {
        throw new Error('Syllabus file path not set');
    }

    let coursePath = path.dirname( syllabus?.filePath || '');
    if (syllabus.module_dir) {
        coursePath = path.resolve(coursePath, syllabus.module_dir);
    }

    if (!fs.existsSync(coursePath)) {
        throw vscode.FileSystemError.FileNotFound(`Course directory not found at path: ${coursePath}` );
    }

    const storageDir = path.join(coursePath, 'store');

    if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
    }
    
    const completionFilePath = syllabusPath.replace(/\.yaml$/, '-completion.json');

    // Create the completion status file if it doesn't exist, for storing and persisting completion status
    if (!fs.existsSync(completionFilePath)) {
        fs.writeFileSync(completionFilePath, JSON.stringify({}));
    }

    return {
        syllabusPath: syllabus.filePath || '',
        coursePath,
        storageDir, 
        completionFilePath
    };
}

function setupFileWatcher(sylFs: SylFs, lessonProvider: SyllabusProvider, context: vscode.ExtensionContext) : void {
    //
    // Watch the syllabus file for changes

    const watcher = fs.watch(sylFs.syllabusPath, (eventType) => {
        if (eventType === 'change') {
            let syllabus = yaml.load(fs.readFileSync(sylFs.syllabusPath, 'utf8')) as Syllabus;
            lessonProvider.updateSyllabus(syllabus);
        }
    });

    context.subscriptions.push({ dispose: () => watcher.close() });

    // Watch for changes in configuration
    vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('jtl.syllabus.path') || e.affectsConfiguration('jtl.syllabus.preferEnv')) {
            let syllabus = yaml.load(fs.readFileSync(sylFs.syllabusPath, 'utf8')) as Syllabus;
            lessonProvider.updateSyllabus(syllabus);
        }
    });
}

function createTreeDP(context: vscode.ExtensionContext) : SyllabusProvider | null {

    //
    // Create the Tree Data Provider

    let syllabus = loadSyllabus(context);

    if (!syllabus) {        
        console.log('No syllabus found, skipping lesson browser activation');
        return null;
    }

    let sylFs: SylFs = setupFs(syllabus, context);

    const lessonProvider = new SyllabusProvider(context, syllabus, sylFs);

    setupFileWatcher(sylFs, lessonProvider, context);

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

