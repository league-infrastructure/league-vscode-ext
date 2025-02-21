import * as vscode from 'vscode';
import { activateVirtDisplay } from './virtdisplay';
import { activateKeyRate } from './keystrokes';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';



export function activateLessonBrowser(context: vscode.ExtensionContext) {

    //
    // Load the Syllabus file

    const jtlSyllabus = process.env.JTL_SYLLABUS;

    if (!jtlSyllabus) {
        vscode.window.showErrorMessage('JTL_SYLLABUS environment variable is not set.');
        return;
    }

    const syllabusPath = path.isAbsolute(jtlSyllabus) ? jtlSyllabus : path.join(context.extensionPath, jtlSyllabus);
    if (!fs.existsSync(syllabusPath)) {
        vscode.window.showErrorMessage(`Course file not found at path: ${syllabusPath}`);
        return;
    }

    const coursePath = path.dirname(syllabusPath);
    let syllabus = yaml.load(fs.readFileSync(syllabusPath, 'utf8')) as any;

    const completionFilePath = path.join(coursePath, 'lessonCompletion.json');
    if (!fs.existsSync(completionFilePath)) {
        fs.writeFileSync(completionFilePath, JSON.stringify({}));
    }
    let completionStatus = JSON.parse(fs.readFileSync(completionFilePath, 'utf8'));

    //
    // Create the Tree Data Provider

    const lessonProvider = new LessonProvider(syllabus, completionStatus);
    const treeDataProvider = vscode.window.registerTreeDataProvider('lessonBrowserView', lessonProvider);
    context.subscriptions.push(treeDataProvider);

    const openLessonCommand = vscode.commands.registerCommand('lessonBrowser.openLesson', (lessonItem: LessonItem) => {
        openLesson(lessonItem.module, coursePath); // Pass the module of the LessonItem
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

    //lessonProvider.expandAll();

    //
    // Watch the syllabus file for changes

    const watcher = fs.watch(syllabusPath, (eventType) => {
        if (eventType === 'change') {
            syllabus = yaml.load(fs.readFileSync(syllabusPath, 'utf8')) as any;
            lessonProvider.updateSyllabus(syllabus);
        }
    });
    context.subscriptions.push({ dispose: () => watcher.close() });

    // Hide the activity bar
    vscode.workspace.getConfiguration('workbench').update('activityBar.visible', false, true);


    // Turn off the minimap
    vscode.workspace.getConfiguration('editor').update('minimap.enabled', false, true);

}

async function openLesson(lesson: any, coursePath: string) {
    await vscode.workspace.saveAll(false);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');

    // Open lesson first if it exists
    if (lesson.lesson) {
        const lessonPath = path.join(coursePath, lesson.lesson);
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

    // Then open exercise after lesson is fully loaded
    if (lesson.exercise) {
        const exercisePath = path.join(coursePath, lesson.exercise);
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

    constructor(private course: any, private completionStatus: any) {}

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