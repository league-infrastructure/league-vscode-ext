import * as vscode from 'vscode';
import { activateVirtDisplay } from './virtdisplay';
import { activateKeyRate } from './keystrokes';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

interface Lesson {
    name: string;
    exercise?: string;
    lesson?: string; // Some lessons have a markdown reference instead
    display?: boolean;
    lessons?: Lesson[]; // Nested lessons (e.g., "Turtle Tricks A")
}

interface Module {
    name: string;
    overview?: string;
    lessons?: Lesson[];
}

interface Syllabus {
    name: string;
    description: string;
    module_dir: string;
    modules: Module[];
}

export async function activateLessonBrowser(context: vscode.ExtensionContext) {

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

    //
    // Load the Syllabus Data
    // 

    console.log('Loading syllabus from:', syllabusPath);

    let syllabus = yaml.load(fs.readFileSync(syllabusPath, 'utf8')) as Syllabus;

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


    const storageDir = path.join(coursePath, 'store');

    if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
    }
    

    //
    // Create the Tree Data Provider
    const completionFilePath = syllabusPath.replace(/\.yaml$/, '-completion.json');

    const lessonProvider = new SyllabusProvider(syllabus, completionFilePath, coursePath, storageDir);
    const treeDataProvider = vscode.window.registerTreeDataProvider('lessonBrowserView', lessonProvider);
    context.subscriptions.push(treeDataProvider);

    const openLessonCommand = vscode.commands.registerCommand('lessonBrowser.openLesson', (lessonItem: LessonItem) => {
        lessonProvider.openLesson(lessonItem); 
    });
    context.subscriptions.push(openLessonCommand);

    const toggleCompletionCommand = vscode.commands.registerCommand('lessonBrowser.toggleCompletion', (lesson?) => {
        lessonProvider.toggleCompletion(lesson);
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

            activateLessonBrowser(context);
        }
    });


    // Hide the activity bar
    await vscode.commands.executeCommand('workbench.action.activityBarLocation.bottom');

    // Turn off the minimap
    await vscode.workspace.getConfiguration('editor').update('minimap.enabled', false, true);

    console.log('Lesson browser activated');

    // Unhide the activity bar when the extension is deactivated
     context.subscriptions.push({
        dispose: () => {
            vscode.workspace.getConfiguration('workbench').update('activityBar.visible', true, true);
        }
    });

}

export function deactivateLessonBrowser() {
    console.log('Lesson browser deactivated');
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

class SyllabusProvider implements vscode.TreeDataProvider<SyllabusItem> {

    private _onDidChangeTreeData: vscode.EventEmitter<SyllabusItem | undefined | void> = 
        new vscode.EventEmitter<SyllabusItem | undefined | void>();

    readonly onDidChangeTreeData: vscode.Event<SyllabusItem | undefined | void> = 
        this._onDidChangeTreeData.event;

    private _viewer?: vscode.TreeView<SyllabusItem>;
    private lastOpenedLessonItem?: LessonItem;
    public completionStatus: any = {};

    constructor(
        private course: any, 
        private completionFilePath: any,
        private coursePath: string, 
        private storageDir: string) {

        // Create the completion status file if it doesn't exist, for storing and persisting completion status
        if (!fs.existsSync(completionFilePath)) {
            fs.writeFileSync(completionFilePath, JSON.stringify({}));
        }

        this.completionStatus = JSON.parse(fs.readFileSync(completionFilePath, 'utf8'));    
            
    }

    setTreeView(viewer: vscode.TreeView<SyllabusItem>) {
        this._viewer = viewer;
    }

    updateSyllabus(newSyllabus: any) {
        this.course = newSyllabus;
        this._onDidChangeTreeData.fire();
        //this.expandAll();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SyllabusItem): vscode.TreeItem {
        element.update();
        return element;
    }

    getChildren(element?: SyllabusItem): Thenable<SyllabusItem[]> {
       
        if (!element) {
            return Promise.resolve(this.course.modules.map((module: any) => new ModuleItem(this, module)));
        }

        return element.getChildren(element);
    }

    toggleCompletion(arg?: LessonItem | vscode.Uri ): void {

        if (!arg) {
            return this.toggleCompletion(this.lastOpenedLessonItem);
        } else if ('scheme' in arg) {
            // It is a URI, from the button in the title bar of the editor menu

            // Could lookup the path to the editor file to be sure we have the right item, but
            // the open editor ought to be the one selected in the tree view. 
            return this.toggleCompletion(this.lastOpenedLessonItem);
        } else {
            // From the right click context menu in the Tree View. 
            const lessonId = arg.lesson.name;
            this.completionStatus[lessonId] = !this.completionStatus[lessonId];
            fs.writeFileSync(this.completionFilePath, JSON.stringify(this.completionStatus));
            this.refresh();
        }
    }

    async openLesson(lessonItem: LessonItem ) {

        let lesson = lessonItem.lesson;


        await vscode.workspace.saveAll(false);
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');

        // Open lesson first if it exists
        if (lesson.lesson) {
            if (lesson.lesson.startsWith('http://') || lesson.lesson.startsWith('https://')) {
           
                await vscode.commands.executeCommand('simpleBrowser.show', lesson.lesson);
            } else {
                const lessonPath = path.join(this.coursePath, lesson.lesson);
                if (fs.existsSync(lessonPath)) {
                
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
            let exercisePath = path.join(this.coursePath, lesson.exercise);

            exercisePath = await resolvePath(exercisePath, this.storageDir);

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
            await vscode.commands.executeCommand('jointheleague.openVirtualDisplay');
        } else {
            await vscode.commands.executeCommand('jointheleague.closeVirtualDisplay');
        }

        if (lesson.terminal) {

            const terminal = vscode.window.createTerminal('Lesson Terminal');
            terminal.show();
        } else {

            vscode.window.terminals.forEach(terminal => terminal.dispose());
        }

        this.lastOpenedLessonItem = lessonItem;


    }

}

abstract class SyllabusItem extends vscode.TreeItem {

    //iconPath = {
    //    light: path.join(__filename, '..', '..', 'resources', 'light', 'dependency.svg'),
    //    dark: path.join(__filename, '..', '..', 'resources', 'dark', 'dependency.svg')
    //};

    protected static readonly checkOnIcon = new vscode.ThemeIcon('check');
    protected static readonly checkOffIcon = new vscode.ThemeIcon('circle-outline');

    constructor(
        public readonly data: Lesson | Module,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
    ) {
        super(data.name, collapsibleState);
    }

    abstract update(): void;
    abstract getChildren(element?: SyllabusItem): Thenable<SyllabusItem[]>;
   
}

class ModuleItem extends SyllabusItem {

    constructor( public provider: SyllabusProvider,   public readonly module: any) {
        super(module);
        this.contextValue = 'module';
    }

    update(): void {
        const allChildrenComplete = this.module.lessons.every((lesson: any) => this.provider.completionStatus[lesson.name]);
        this.iconPath =  allChildrenComplete ? SyllabusItem.checkOnIcon : SyllabusItem.checkOffIcon;
       
    }

    getChildren(element?: SyllabusItem): Thenable<SyllabusItem[]> {
        if (!this.module.lessons) {
            return Promise.resolve([]);
        }
        return Promise.resolve(this.module.lessons.map((lesson: any) => new LessonItem(this.provider, lesson)));
    }
}

class LessonItem extends SyllabusItem {

    constructor( public provider: SyllabusProvider, public lesson: any) {
        const cState = lesson.lessons && lesson.lessons.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        super(lesson, cState);
        this.contextValue = 'lesson';

        this.command = {
            command: 'lessonBrowser.openLesson',
            title: 'Open Lesson',
            arguments: [this]
        };
    }

    update(): void {
        console.log('getTreeItem', this.lesson.name, this.provider.completionStatus[this.lesson.name]);
        this.iconPath =  this.provider.completionStatus[this.lesson.name] ? LessonItem.checkOnIcon : LessonItem.checkOffIcon;

    }

    getChildren(element?: SyllabusItem): Thenable<SyllabusItem[]> {
        if (!this.lesson.lessons) {
            return Promise.resolve([]);
        }
        return Promise.resolve(this.lesson.lessons.map((lesson: any) => new LessonItem(this.provider, lesson)));
    }
}
