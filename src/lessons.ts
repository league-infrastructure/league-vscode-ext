import * as vscode from 'vscode';
import { activateVirtDisplay } from './virtdisplay';
import { activateKeyRate } from './keystrokes';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';


export function activateLessonBrowser(context: vscode.ExtensionContext) {

    //
    // Load the Syllabus file from either the env var or the config

    const jtlSyllabusConfig = vscode.workspace.getConfiguration('jtl').get<string>('syllabus.path');
    const jtlSyllabusEnv = process.env.JTL_SYLLABUS;

    // determine which value to prefer
    let jtlSyllabus;
    const pref = vscode.workspace.getConfiguration('jtl').get<boolean>('syllabus.preferEnv');
    if (pref){
        jtlSyllabus = jtlSyllabusEnv || jtlSyllabusConfig ;
        console.log(`Prefering (${pref}) environment variable ${jtlSyllabus}`);
    } else {
        jtlSyllabus = jtlSyllabusConfig || jtlSyllabusEnv;
        console.log(`Prefering  (${pref}) configuration variable ${jtlSyllabus}`);
    }

    if (!jtlSyllabus) {
        console.log('JTL_SYLLABUS environment variable is not set.');
        return;
    }

    const syllabusPath = path.isAbsolute(jtlSyllabus) ? jtlSyllabus : path.join(context.extensionPath, jtlSyllabus);
    if (!fs.existsSync(syllabusPath)) {
        vscode.window.showErrorMessage(`Course file not found at path: ${syllabusPath}`);
        return;
    }

    console.log('Loading syllabus from:', syllabusPath);

    let syllabus = yaml.load(fs.readFileSync(syllabusPath, 'utf8')) as any;

    let coursePath = path.dirname(syllabusPath);
    if (syllabus.module_dir) {
        coursePath = path.resolve(coursePath, syllabus.module_dir);
    }

    if (!fs.existsSync(coursePath)) {
        vscode.window.showErrorMessage(`Course directory not found at path: ${coursePath}`);
        return;
    } else {
        console.log('Course directory:', coursePath);
    }


    // Check if the syllabus is in the correct format
    if (!syllabus.modules || !Array.isArray(syllabus.modules) || syllabus.modules.length === 0 || !syllabus.modules[0].lessons || !syllabus.modules[0].lessons[0].name) {
        console.log(`Invalid syllabus format in file ${syllabusPath}`);
        return;
    }

    console.log('Syllabus loaded:', syllabus);

    const completionFilePath = syllabusPath.replace(/\.yaml$/, '-completion.json');
    if (!fs.existsSync(completionFilePath)) {
        fs.writeFileSync(completionFilePath, JSON.stringify({}));
    }
    let completionStatus = JSON.parse(fs.readFileSync(completionFilePath, 'utf8'));

    const storageDir = path.join(coursePath, 'store');

    if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
    }
    

    //
    // Create the Tree Data Provider

    const lessonProvider = new LessonProvider(syllabus, completionStatus, storageDir);
    const treeDataProvider = vscode.window.registerTreeDataProvider('lessonBrowserView', lessonProvider);
    context.subscriptions.push(treeDataProvider);

    const openLessonCommand = vscode.commands.registerCommand('lessonBrowser.openLesson', (lessonItem: LessonItem) => {
        openLesson(lessonItem.module, coursePath, storageDir); // Pass the module of the LessonItem
    });
    context.subscriptions.push(openLessonCommand);

    const toggleCompletionCommand = vscode.commands.registerCommand('lessonBrowser.toggleCompletion', (lesson) => {
        if (!lesson.module.lessons) { // Only toggle if it's a leaf node
            const lessonId = lesson.module.name;
            completionStatus[lessonId] = !completionStatus[lessonId];
            fs.writeFileSync(completionFilePath, JSON.stringify(completionStatus));
            lessonProvider.refresh();
        }
    });
    context.subscriptions.push(toggleCompletionCommand);

   
    //
    // Watch the syllabus file for changes

    const watcher = fs.watch(syllabusPath, (eventType) => {
        if (eventType === 'change') {
            syllabus = yaml.load(fs.readFileSync(syllabusPath, 'utf8')) as any;
            lessonProvider.updateSyllabus(syllabus);
        }
    });
    context.subscriptions.push({ dispose: () => watcher.close() });

    // Watch for changes in configuration
    vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('jtl.syllabus.path') || e.affectsConfiguration('jtl.syllabus.preferEnv')) {
            console.log('Configuration change detected, reloading lesson browser...');
            activateLessonBrowser(context);
        }
    });




    // Hide the activity bar
    vscode.workspace.getConfiguration('workbench').update('activityBar.visible', false, true);


    // Turn off the minimap
    vscode.workspace.getConfiguration('editor').update('minimap.enabled', false, true);

    console.log('Lesson browser activated');

}

async function resolvePath(filePath: string, storageDir: string): Promise<string> {
    if (!filePath.startsWith('http://') && !filePath.startsWith('https://')) {
        return filePath;
    }

    const url = new URL(filePath);
    const domainPath = path.join(storageDir, url.hostname, url.pathname);
    const localPath = path.resolve(domainPath);

    if (fs.existsSync(localPath)) {
        return localPath;
    }

    await downloadFile(filePath, localPath);
    return localPath;
}

function downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const protocol = url.startsWith('https') ? https : http;

        protocol.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
                return;
            }

            response.pipe(file);
            file.on('finish', () => {
                file.close(() => resolve());
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
}

async function openLesson(lesson: any, coursePath: string, storageDir: string) {
    await vscode.workspace.saveAll(false);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');

    // Open lesson first if it exists
    if (lesson.lesson) {
        

        if (lesson.lesson.startsWith('http://') || lesson.lesson.startsWith('https://')) {
            console.log('Browsing lesson:', lesson.lesson);
            await vscode.commands.executeCommand('simpleBrowser.show', lesson.lesson);
            
        } else {

            const lessonPath = path.join(coursePath, lesson.lesson);

            if (fs.existsSync(lessonPath)) {

                console.log('Opening lesson:', lessonPath);
                    if (path.extname(lessonPath) === '.md') {
                    const doc = await vscode.workspace.openTextDocument(lessonPath);
                    await vscode.commands.executeCommand('markdown.showPreview', doc.uri);
                } else {
                    const doc = await vscode.workspace.openTextDocument(lessonPath);
                    await vscode.window.showTextDocument(doc, { preview: false });
                }
            }
        }
    }

    // Then open exercise after lesson is fully loaded
    if (lesson.exercise) {
        let exercisePath = path.join(coursePath, lesson.exercise);
        console.log('Opening exercise:', exercisePath);
        exercisePath = await resolvePath(exercisePath, storageDir);
        console.log('Resolved exercise path:', exercisePath);
        if (fs.existsSync(exercisePath)) {
            if (path.extname(exercisePath) === '.ipynb') {
                await vscode.commands.executeCommand('vscode.openWith',
                    vscode.Uri.file(exercisePath), 'jupyter-notebook');
                await vscode.commands.executeCommand('workbench.action.moveEditorToAboveGroup');
            } else {
                const doc = await vscode.workspace.openTextDocument(exercisePath);
                await vscode.window.showTextDocument(doc, { preview: false });
                await vscode.commands.executeCommand('workbench.action.moveEditorToAboveGroup');
            }
        }
    }

    if (lesson.display) {
        console.log('Opening virtual display');
        await vscode.commands.executeCommand('jointheleague.openVirtualDisplay');
    } else {
        console.log('Closing virtual display');
        await vscode.commands.executeCommand('jointheleague.closeVirtualDisplay');
    }

    if (lesson.terminal) {
        console.log('Opening terminal');
        const terminal = vscode.window.createTerminal('Lesson Terminal');
        terminal.show();
    } else {
        console.log('Closing all terminals');
        vscode.window.terminals.forEach(terminal => terminal.dispose());
    }


    console.log('Opened lesson:', lesson.name);
}

class LessonProvider implements vscode.TreeDataProvider<LessonItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<LessonItem | undefined | void> = 
        new vscode.EventEmitter<LessonItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<LessonItem | undefined | void> = 
        this._onDidChangeTreeData.event;

    private _viewer?: vscode.TreeView<LessonItem>;

    setTreeView(viewer: vscode.TreeView<LessonItem>) {
        this._viewer = viewer;
    }

    constructor(private course: any, private completionStatus: any, private storageDir: string) {}

    updateSyllabus(newSyllabus: any) {
        this.course = newSyllabus;
        this._onDidChangeTreeData.fire();
        //this.expandAll();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async expandAll(): Promise<void> {
      
        if (!this._viewer) return;

        const expand = async (element?: LessonItem) => {

            const children = await this.getChildren(element) || [];

            for (const child of children) {
                if (this._viewer){
                    await this._viewer.reveal(child, { expand: true });
                }
                await expand(child);
            }
        };

        await expand();
    }

    getTreeItem(element: LessonItem): vscode.TreeItem {
        const treeItem = element;
        const lessonId = element.module.name;
        if (!element.module.lessons) { // Only show completion icon for leaf nodes
            treeItem.iconPath = this.completionStatus[lessonId] ? new vscode.ThemeIcon('check') : new vscode.ThemeIcon('circle-outline');
            treeItem.command = {
                command: 'lessonBrowser.openLesson',
                title: 'Open Lesson',
                arguments: [element]
            };
        } else {
            const allChildrenComplete = element.module.lessons.every((lesson: any) => this.completionStatus[lesson.name]);
            treeItem.iconPath = allChildrenComplete ? new vscode.ThemeIcon('check') : new vscode.ThemeIcon('circle-outline');
        }
        treeItem.contextValue = 'lesson';
        return treeItem;
    }

    getChildren(element?: LessonItem): Thenable<LessonItem[]> {
        if (!element) {
            return Promise.resolve(this.course.modules.map((module: any) => new LessonItem(module.name, module, vscode.TreeItemCollapsibleState.Collapsed)));
        } else if (element.module) {
            return Promise.resolve(element.module.lessons.map((lesson: any) => new LessonItem(lesson.name, lesson, lesson.lessons ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None)));
        } else {
            return Promise.resolve([]);
        }
    }
}

class LessonItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly module: any,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState 
    ) {
        super(label, collapsibleState);
        this.contextValue = 'lesson';
        if (!module.lessons) {
            this.command = {
                command: 'lessonBrowser.openLesson',
                title: 'Open Lesson',
                arguments: [this] // Pass the LessonItem instance
            };
        }
        this.contextValue = 'lesson';
    }
}