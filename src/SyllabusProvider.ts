/**
 *  SyllabusProvider manage the data for the Syllabus tree view, the main view for the extension. 
 * 
 * 
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { resolvePath } from './lessons';
import { SylFs } from './models';
import { Syllabus, Lesson, Module } from './models';

export class SyllabusProvider implements vscode.TreeDataProvider<SyllabusItem> {

    private _onDidChangeTreeData: vscode.EventEmitter<SyllabusItem | undefined | void> = new vscode.EventEmitter<SyllabusItem | undefined | void>();

    readonly onDidChangeTreeData: vscode.Event<SyllabusItem | undefined | void> = this._onDidChangeTreeData.event;

    private _viewer?: vscode.TreeView<SyllabusItem>;

    private root: RootItem;

    private firstExpanded: boolean = false;

    private itemMap: Map<number, SyllabusItem> = new Map();

    private nextNodeId: number = 0;
    private activeLessonItem: LessonItem | null = null;

   
    constructor(private context: vscode.ExtensionContext, private syllabus: Syllabus, private sylFs: SylFs) {
        
        this.updateSyllabus(syllabus)

        // Create and register the TreeView
        let viewId = 'lessonBrowserView'; // must match the id in package.json
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
            console.log('Selection changed:', this.activeLessonItem?.data.name);

        });


        this.root = new RootItem(this, syllabus);

        console.log('WALK Root:', this.root);

        this.walk(this.root, (item: SyllabusItem) => {
            console.log(`WALK Name: ${item.label}, SPath: ${item.getSPath()}`);
        });
    }

    updateSyllabus(newSyllabus: Syllabus) {
        this.syllabus = newSyllabus;

        this.readCompletion();
        this._onDidChangeTreeData.fire();
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

        element.update();

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
        this.nextNodeId++;
        item.nodeId = this.nextNodeId;
        this.itemMap.set(this.nextNodeId, item);
    }

    readCompletion(): void {
        try {
            const data = fs.readFileSync(this.sylFs.completionFilePath, 'utf8');
            const completedLessons = JSON.parse(data);
            console.log('Read completion file:', completedLessons);
            console.log('ItemMap:', this.itemMap);
            if (Array.isArray(completedLessons)) {

                completedLessons.forEach((id: number) => {
                    
                    const lessonItem = this.itemMap.get(id);
                    console.log(`Setting completion status for: ${id}, ${lessonItem?.data.name}`);
                    if (lessonItem && lessonItem instanceof LessonItem) {
                        lessonItem.update();

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

    toggleCompletion(arg?: LessonItem | vscode.Uri |  null): void {

        console.log('Toggle completion:', arg);

        if (!arg) {
            return this.toggleCompletion(this.activeLessonItem);
        } else if ('scheme' in arg) {
            // It is a URI, from the button in the title bar of the editor menu
            // Could lookup the path to the editor file to be sure we have the right item, but
            // the open editor ought to be the one selected in the tree view. 
            return this.toggleCompletion(this.activeLessonItem);
        }

        // From the right click context menu in the Tree View. 
        const lessonId = 0
        this.itemMap.get(lessonId)?.setCompletionStatus(!arg.getCompletionStatus());
        this.writeCompletion();
       
        this.refresh();

        if (arg.getCompletionStatus()){        // Get the next lesson and open it if it exists
            const nextLessonId = lessonId + 1;
            const nextLessonItem = this.itemMap.get(nextLessonId);

            if (nextLessonItem && nextLessonItem instanceof LessonItem) {
                this.openLesson(nextLessonItem);
                console.log('Opening next lesson:', nextLessonItem.lesson.name, this._viewer);
                this._viewer?.reveal(nextLessonItem, { select: true, focus: true });
            }
        }
    }

    async openLesson(lessonItem: LessonItem) {

        let lesson = lessonItem.lesson;


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
    protected static readonly checkOffIcon = new vscode.ThemeIcon('square-outline');


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
        this.iconPath = new vscode.ThemeIcon('folder');
    }

    
    getChildren(element?: SyllabusItem): Thenable<SyllabusItem[]>{
        return Promise.resolve(this.children);
    }

    update(): void {

    }

    setCompletionStatus(completed: boolean): void {
        
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

        console.log('Root item created:');

        syllabus.modules.forEach((module, index) => {
            this.children.push(new ModuleItem(provider, module, index));
        });

        this.iconPath = new vscode.ThemeIcon('folder');


    }

    update(): void {
        this.completed = this.children.every((c: SyllabusItem) => c.getCompletionStatus());
        this.iconPath = this.getCompletionStatus() ? SyllabusItem.checkOnIcon : SyllabusItem.checkOffIcon;
    }

}

export class ModuleItem extends SyllabusItem {

    constructor(public provider: SyllabusProvider, public readonly module: Module, public readonly index: number = 0) {
        super(module, null);
        this.contextValue = 'module';
        this.spath = "m"+index.toString();
        this.tooltip = this.generateTooltip();
        
        provider.enumerateItem(this);
        //console.log('Module item created:', this.spath, module.name);

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
    }

    setCompletionStatus(completed: boolean): void {
        this.completed = completed;   
        this.iconPath = this.completed ? SyllabusItem.checkOnIcon : SyllabusItem.checkOffIcon; 
        this.parent?.update()
        
    }

    updateCompletionState(): void {

        this.completed  = this.children.every((c: SyllabusItem) => c.getCompletionStatus() || false);

        this.iconPath = this.completed ? SyllabusItem.checkOnIcon : SyllabusItem.checkOffIcon;

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

        //console.log('Lesson item created:', this.spath, lesson.name);

        this.tooltip = this.generateTooltip();
    }

    setCompletionStatus(completed: boolean): void {
        this.completed = completed;   
        this.iconPath = this.completed ? SyllabusItem.checkOnIcon : SyllabusItem.checkOffIcon; 
        this.parent?.update()
        
    }

    update(): void {

        if (this.lesson.lessons) {
            const allChildrenComplete = this.children.every((c: SyllabusItem) => c.getCompletionStatus() || false);
            this.iconPath = allChildrenComplete ? SyllabusItem.checkOnIcon : SyllabusItem.checkOffIcon;
        } else {
            const nodeId = 0
            this.iconPath = nodeId && this.getCompletionStatus() ? LessonItem.checkOnIcon : LessonItem.checkOffIcon;
        }
    }

}