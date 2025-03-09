/**
 *  SyllabusProvider manage the data for the Syllabus tree view, the main view for the extension. 
 * 
 * 
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import * as yaml from 'js-yaml';
import { URL } from 'url';

import { SylFs } from './models';
import { Syllabus, Lesson, Module } from './models';

function setupFs(syllabus: Syllabus, context: vscode.ExtensionContext): SylFs {

    let syllabusPath = syllabus.filePath;

    if (!syllabusPath) {
        throw new Error('Syllabus file path not set');
    }

    let coursePath = path.dirname(syllabus?.filePath || '');

    if (syllabus.module_dir) {
        coursePath = path.resolve(coursePath, syllabus.module_dir);
    }

    if (!fs.existsSync(coursePath)) {
        throw vscode.FileSystemError.FileNotFound(`Course directory not found at path: ${coursePath}`);
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

export async function resolvePath(filePath: string, storageDir: string): Promise<string> {
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

export class SyllabusProvider implements vscode.TreeDataProvider<SyllabusItem> {

    private _onDidChangeTreeData: vscode.EventEmitter<SyllabusItem | undefined | void> = 
        new vscode.EventEmitter<SyllabusItem | undefined | void>();

    readonly onDidChangeTreeData: vscode.Event<SyllabusItem | undefined | void> = 
        this._onDidChangeTreeData.event;

    private _viewer?: vscode.TreeView<SyllabusItem>;

    private root: RootItem;

    private firstExpanded: boolean = false;

    private itemMap: Map<number, SyllabusItem> = new Map();

    private nextNodeId: number = 0;
    private activeLessonItem: LessonItem | null = null;

    // sylFS gets setup in updateSyllabus
    public sylFs: SylFs = { syllabusPath: '', coursePath: '', storageDir: '', completionFilePath: '' };
      

    constructor(context: vscode.ExtensionContext) {
        
        this.register(context);

        this.root = this.updateSyllabus(context);


        if (!context.globalState.get('jtl.syllabus.isDevMode', false)) {
            this.openLesson(null);
        }

    }

    public register(context: vscode.ExtensionContext): any {

        let viewId = 'lessonBrowserView'; // must match the id in package.json

        const treeDataProvider = vscode.window.registerTreeDataProvider(viewId, this);
        
        //context.subscriptions.push(treeDataProvider);

        this._viewer = vscode.window.createTreeView(viewId, {
            treeDataProvider: this
        });
        context.subscriptions.push(this._viewer);
        
        // Register an event listener for the onDidChangeSelection event
        this._viewer.onDidChangeSelection(event => {
            if (event.selection.length > 0) {
                if (event.selection[0] instanceof LessonItem) {
                    this.activeLessonItem = event.selection[0];
                } else {
                    this.activeLessonItem = null;
                }
            } else {
                this.activeLessonItem = null;
            }

        });

        // setup: events

        this._viewer.onDidCollapseElement(e => {
            console.log("onDidCollapseElement",e); // breakpoint here for debug
        });
        this._viewer.onDidChangeVisibility(e => {
            console.log("onDidChangeVisibility",e); // breakpoint here for debug
        });
        this._viewer.onDidExpandElement(e => {
            console.log("onDidExpandElement",e); // breakpoint here for debug
        });

        // Actions


        // Register the commands
    
        const openLessonCommand = vscode.commands.registerCommand('lessonBrowser.openLesson', (lessonItem: LessonItem) => {
            this.openLesson(lessonItem); 
        });
        context.subscriptions.push(openLessonCommand);
    
        const toggleCompletionCommand = vscode.commands.registerCommand('lessonBrowser.toggleCompletion', (lessonItem?: LessonItem) => {
            this.toggleCompletion(lessonItem);
        });
        context.subscriptions.push(toggleCompletionCommand);

        // Register the new setCompletion command
        const setCompletionCommand = vscode.commands.registerCommand('lessonBrowser.setCompletion', (lessonItem?: LessonItem) => {
            this.setCompletion(lessonItem);
        });
        context.subscriptions.push(setCompletionCommand);

        const clearCompletionCommand = vscode.commands.registerCommand('lessonBrowser.clearCompletion', () => {
            this.clearCompletion();
            this.openLesson(0);
        });
        context.subscriptions.push(clearCompletionCommand);
    }


    public loadSyllabus(context: vscode.ExtensionContext): Syllabus | false {
    
        //
        // Load the Syllabus file from either the env var or the config
    
        const jtlSyllabusConfig = vscode.workspace.getConfiguration('jtl').get<string>('syllabus.path');
        const jtlSyllabusEnv = process.env.JTL_SYLLABUS;
    
        // determine which value to prefer
        let jtlSyllabus;
    
        const pref = vscode.workspace.getConfiguration('jtl').get<boolean>('syllabus.preferEnv');
        if (pref) {
            jtlSyllabus = jtlSyllabusEnv || jtlSyllabusConfig;
        } else {
            jtlSyllabus = jtlSyllabusConfig || jtlSyllabusEnv;
        }
    
        if (!jtlSyllabus) {
            //throw new NoSyllabusError('JTL_SYLLABUS environment variable or configuration is not set.');
            return false
        }
    
        const syllabusPath = path.isAbsolute(jtlSyllabus) ? jtlSyllabus : path.join(context.extensionPath, jtlSyllabus);
        if (!fs.existsSync(syllabusPath)) {
            throw vscode.FileSystemError.FileNotFound(`Course file not found at path: ${syllabusPath}`);
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
    
    

    public updateSyllabus(context: vscode.ExtensionContext) : RootItem {

        const syllabus: Syllabus | false = this.loadSyllabus(context);

        if (!syllabus) {
            throw Error('No syllabus loaded');
        }

        this.sylFs = setupFs(syllabus, context);

        this.root = new RootItem(this, syllabus);

        this.readCompletion();
        this._onDidChangeTreeData.fire();
        console.log('Syllabus updated');
        return this.root
    }

    /**
     * Enumerate the nodes in the syllabus to make it easier to find them later
     */
    walk(root: RootItem, callback: (item: SyllabusItem) => void): void {
        
        const walkRecursive = (item: SyllabusItem) => {
            callback(item);
            item.children.forEach(child => walkRecursive(child));
            
        };
        walkRecursive(root);
    }
    
    
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SyllabusItem): vscode.TreeItem {

        // Expand the first module on initial open. 
        if (element instanceof ModuleItem && !this.firstExpanded) {
            element.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            this.firstExpanded = true;
        }


        return element;
    }

    getChildren(element?: SyllabusItem): Thenable<SyllabusItem[]> {

        if (!element) {
            return Promise.resolve([this.root]);
        }

        return element.getChildren(element);
    }

    getParent(element: SyllabusItem): SyllabusItem | null {
        return element.parent;
    }

    /**
     * 
     * @param item Set the serial nodeId for the node and add it to the Node map
     */
    enumerateItem(item: SyllabusItem): void {
        
        if(item instanceof LessonItem) {
            item.nodeId = this.nextNodeId;
            this.itemMap.set(item.nodeId, item);
            this.nextNodeId++;
        }
    }

    readCompletion(): void {
        try {
            const data = fs.readFileSync(this.sylFs.completionFilePath, 'utf8');
            const completedLessons = JSON.parse(data);

            if (Array.isArray(completedLessons)) {

                completedLessons.forEach((id: number) => {
                    
                    const lessonItem = this.itemMap.get(id);

                    if (lessonItem && lessonItem instanceof LessonItem) {
                        lessonItem.setCompletionStatus(true);
                    }
                    
                });
            }

        } catch (error) {
            console.error('Error reading completion file:', error);
        }
    }

    writeCompletion(): void {
        const completedLessons: number[] = [];
        this.itemMap.forEach((item, id) => {
            if (item instanceof LessonItem && item.getCompletionStatus()) {
                completedLessons.push(id);
            }
        });

        try {
            completedLessons.sort((a, b) => a - b);

            fs.writeFileSync(this.sylFs.completionFilePath, JSON.stringify(completedLessons));
        } catch (error) {
            console.error('Error writing completion file:', error);
        }
    }

    nextIncompleteLesson(lesson: LessonItem | number | null): LessonItem | null {

        let nodeId;

        if (lesson === null) {
            nodeId = -1;
        } else if (typeof lesson === 'number') {
            nodeId = lesson
        } else {
            nodeId = lesson.nodeId || 0;
        }

        for (let i = nodeId + 1; i < this.nextNodeId; i++) {
            const nextLesson = this.itemMap.get(i);
            if (nextLesson && nextLesson instanceof LessonItem && !nextLesson.getCompletionStatus()) {
                return nextLesson;
            }
        }

        return null;

    }

    clearCompletion(): void {
        this.itemMap.forEach((item, id) => {
            if (item instanceof LessonItem) {
                item.setCompletionStatus(false);
            }
        });
        this.writeCompletion();
        this.refresh();
    }

    toggleCompletion(arg?: LessonItem | vscode.Uri | null): void {

        if (!arg) {
            return this.toggleCompletion(this.activeLessonItem);
        } else if ('scheme' in arg) {
            // It is a URI, from the button in the title bar of the editor menu
            return this.toggleCompletion(this.activeLessonItem);
        }

        if (!arg || !(arg instanceof LessonItem)) {
            console.log('ToggleCompletion: Argument is not a LessonItem:', arg);
            return;
        }

        const newStatus = !arg.getCompletionStatus();
        this.setCompletion(arg, !arg.getCompletionStatus());
    }

    /**
     * Sets the completion status of a lesson to true
     * and advances to the next incomplete lesson
     */
    setCompletion(arg?: LessonItem | vscode.Uri | null, status: boolean = true): void {
        if (!arg) {
            return this.setCompletion(this.activeLessonItem, status);
        } else if ('scheme' in arg) {
            // It is a URI, from the button in the title bar of the editor menu
            return this.setCompletion(this.activeLessonItem, status);
        }

        if (!arg || !(arg instanceof LessonItem)) {
            console.log('SetCompletion: Argument is not a LessonItem:', arg);
            return;
        }

        // Always set to completed (true) regardless of current state
        arg.setCompletionStatus(status);
        this.writeCompletion();
        this.refresh();

        // Get the next lesson and open it if it exists
        const nextLessonItem = this.nextIncompleteLesson(arg);
        if (status && nextLessonItem && nextLessonItem instanceof LessonItem) {
            this.openLesson(nextLessonItem);
        } else {
            console.log(`No next lesson after ${arg.nodeId}`);
        }
    }

    async openLesson(lessonItem: LessonItem | number | null) {

        if (lessonItem == null) {
            lessonItem = this.nextIncompleteLesson(null);
            
        } else if (typeof lessonItem === 'number') {
            lessonItem = this.itemMap.get(lessonItem) as LessonItem;
        }

        if (lessonItem == null) {
            console.log('No lesson to open');
            return;
        }


        let lesson = lessonItem.lesson;
        this._viewer?.reveal(lessonItem, { select: true, focus: true });

        await vscode.workspace.saveAll(false);
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');

        // Open lesson first if it exists
        if (lesson.lesson) {
            if (lesson.lesson.startsWith('http://') || lesson.lesson.startsWith('https://')) {

                await vscode.commands.executeCommand('simpleBrowser.show', lesson.lesson);
            } else {
                const lessonPath = path.join(this.sylFs.coursePath, lesson.lesson);
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
            let exercisePath = path.join(this.sylFs.coursePath, lesson.exercise);

            exercisePath = await resolvePath(exercisePath, this.sylFs.storageDir);

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

        this.activeLessonItem = lessonItem;


    }
}
export abstract class SyllabusItem extends vscode.TreeItem {

    //iconPath = {
    //    light: path.join(__filename, '..', '..', 'resources', 'light', 'dependency.svg'),
    //    dark: path.join(__filename, '..', '..', 'resources', 'dark', 'dependency.svg')
    //};
    protected static readonly checkOnIcon = new vscode.ThemeIcon('check');
    protected static readonly checkAllIcon = new vscode.ThemeIcon('check-all');
    protected static readonly checkOffIcon = new vscode.ThemeIcon('primitive-square');
    protected static readonly folderIcon = new vscode.ThemeIcon('folder');


    public children: SyllabusItem[] = [];
    public completed: boolean = false;
    public spath: string = '';
    public nodeId: number|null = null;

    constructor(
        public readonly data: Lesson | Module,
        public readonly parent: SyllabusItem | null = null,
        public collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
    ) {
        
        super(data.name, collapsibleState);
        
    }

    getChildren(element?: SyllabusItem): Thenable<SyllabusItem[]>{
        return Promise.resolve(this.children);
    }

    updateCompletionStatus(): void {}

    setCompletionStatus(completed: boolean): void {
        this.completed = completed;
    }

    getCompletionStatus(): boolean {
        return this.completed; 
    }

    getSPath(): string {
        return this.spath;
    }

    generateTooltip(): string {
        return `Name: ${this.label}\nSPath: ${this.getSPath()}\nCompletion State: ${this.getCompletionStatus() ? 'Completed' : 'Incomplete'}\nContext Value: ${this.contextValue}\nNode ID: ${this.nodeId}`;
    }


}

export class RootItem extends SyllabusItem {

    constructor(public provider: SyllabusProvider, public readonly syllabus: Syllabus) {
        super(syllabus, null, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'root';

        syllabus.modules.forEach((module, index) => {
            this.children.push(new ModuleItem(provider, module, index));
        });

        this.iconPath = SyllabusItem.folderIcon;

    }

    updateCompletionStatus(): void {
        this.completed  = this.children.every((c: SyllabusItem) => c.completed );
        this.iconPath = this.completed ? SyllabusItem.checkAllIcon : SyllabusItem.folderIcon;
    }

}

export class ModuleItem extends SyllabusItem {

    constructor(public provider: SyllabusProvider, public readonly module: Module, public readonly index: number = 0) {
        super(module, null);
        this.contextValue = 'module';
        this.spath = "m"+index.toString();
        this.tooltip = this.generateTooltip();


        if (module.lessons) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

            module.lessons.forEach((lesson, index) => {
                if (lesson.lessons && lesson.lessons.length > 0) {
                    this.children.push(new LessonSetItem(provider, this, lesson, index));
                } else {
                    this.children.push(new LessonItem(provider, this, lesson, index));
                }
            });        
        } else {
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
        }
        this.iconPath = SyllabusItem.folderIcon;
    }

    updateCompletionStatus(): void {
        this.completed  = this.children.every((c: SyllabusItem) => c.completed );
        this.iconPath = this.completed ? SyllabusItem.checkAllIcon : SyllabusItem.folderIcon;
        this.collapsibleState = this.completed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded;
        this.parent?.updateCompletionStatus();
    }
}

export class LessonSetItem extends SyllabusItem {

    constructor(public provider: SyllabusProvider, public parent: ModuleItem | LessonItem, public lesson: Lesson, public index: number = 0) {
        super(lesson, parent, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'lessonSet';

        this.spath = parent.getSPath() + '/' + "s" + index.toString();

        lesson.lessons?.forEach((lesson, index) => {
            this.children.push(new LessonItem(provider, this, lesson, index));
        });

        this.tooltip = this.generateTooltip();
        this.iconPath = SyllabusItem.folderIcon;
    }

    updateCompletionStatus(): void {

        this.completed  = this.children.every((c: SyllabusItem) => c.completed);
        this.iconPath = this.completed ? SyllabusItem.checkAllIcon : SyllabusItem.folderIcon;
        this.collapsibleState = this.completed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded;
       
        this.parent?.updateCompletionStatus();

    }

}

export class LessonItem extends SyllabusItem {

    constructor(public provider: SyllabusProvider, public parent: ModuleItem | LessonItem, public lesson: Lesson, public index: number = 0) {
        

        super(lesson, parent, vscode.TreeItemCollapsibleState.None);

        this.contextValue = 'lesson';

        provider.enumerateItem(this);
        this.command = {
            command: 'lessonBrowser.openLesson',
            title: 'Open Lesson',
            arguments: [this]
        };
    

        this.spath = parent.getSPath()+'/'+"l"+index.toString();

        this.tooltip = this.generateTooltip();

        this.iconPath =  SyllabusItem.checkOffIcon;
    }

    setCompletionStatus(completed: boolean): void {
        this.completed = completed;   
        this.iconPath = this.completed ? SyllabusItem.checkOnIcon : SyllabusItem.checkOffIcon; 
        this.parent?.updateCompletionStatus();
        
    }

    
}