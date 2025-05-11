import * as vscode from 'vscode';
import { SyllabusProvider, resolvePath } from './SyllabusProvider';
import * as path from 'path';
import { SylFs } from './models';
import { Syllabus, Lesson, Module } from './models';
import * as fs from 'fs';

import { virtualDisplayTab } from './virtdisplay';

export class LessonDisplay {
	lessonTab?: vscode.Tab; 	// Either a Markdown or a Notebook tab
	exerciseTab?: vscode.Tab; 	// A Python tab, maybe Java someday. 
	displayTab?: vscode.Tab; 	// The Simplewebview for the display
	terminalTab?: vscode.Tab; 	// The terminal tab

	lessonEditor?: vscode.TextEditor | vscode.NotebookEditor;
	exerciseEditor?: vscode.TextEditor | vscode.NotebookEditor;
	displayEditor?: vscode.WebviewPanel;
	terminal?: vscode.Terminal;

	private nTabs: number = 0;
	private tabSpec: string = '';

	constructor(private provider: SyllabusProvider, private lesson: Lesson) {
		this.countExpectedTabs();
	}

	/**
	 * Counts the tabs we expect to have open, and sets the tabSpec string
	 * @returns Count the tabs that are expected to be opened.
	 */
	private countExpectedTabs(): number {

		let expectedTabs = 0;


		if (this.lesson.lesson) {
			this.nTabs++;
			this.tabSpec += 'L';
		} else {
			this.tabSpec += 'l';
		}
		if (this.lesson.exercise) {
			this.nTabs++;
			this.tabSpec += 'E';
		} else {
			this.tabSpec += 'e';
		}
		if (this.lesson.display) {
			this.nTabs++;
			this.tabSpec += 'D';
		} else {
			this.tabSpec += 'd';
		}
		if (this.lesson.terminal) {
			this.nTabs++;
			this.tabSpec += 'T';
		} else {
			this.tabSpec += 't';
		}

		return expectedTabs;

	}

	async openLessonTab(): Promise<vscode.TextEditor | vscode.NotebookEditor | undefined> {
		const lessonStrVal = this.lesson.lesson;

		if (!lessonStrVal) {
			return;
		}
		if (lessonStrVal.startsWith('http://') || lessonStrVal.startsWith('https://')) {

			return vscode.commands.executeCommand('simpleBrowser.show', lessonStrVal);
		} else {
			const lessonPath = path.join(this.provider.sylFs.coursePath, lessonStrVal);
			if (fs.existsSync(lessonPath)) {
				const doc = await vscode.workspace.openTextDocument(lessonPath);
				if (path.extname(lessonPath) === '.md') {
					return vscode.commands.executeCommand('markdown.showPreview', doc.uri);
				} else if (path.extname(lessonPath) === '.ipynb') {
					const doc = await vscode.workspace.openNotebookDocument(vscode.Uri.file(lessonPath));
					return vscode.window.showNotebookDocument(doc, { preview: false });
				} else {
					return vscode.window.showTextDocument(doc, { preview: false });
				}
			}
		}
	}

	async openExerciseTab(): Promise<vscode.TextEditor | vscode.NotebookEditor | undefined> {

		const exerciseStrVal = this.lesson.exercise;

		if (!exerciseStrVal) {
			return;
		}
		let exercisePath = path.join(this.provider.sylFs.coursePath, exerciseStrVal);

		exercisePath = await resolvePath(exercisePath, this.provider.sylFs.storageDir);

		if (fs.existsSync(exercisePath)) {
			if (path.extname(exercisePath) === '.ipynb') {
				const doc = await vscode.workspace.openNotebookDocument(vscode.Uri.file(exercisePath));
				return vscode.window.showNotebookDocument(doc, { preview: false });
			} else {
				const doc = await vscode.workspace.openTextDocument(exercisePath);
				return vscode.window.showTextDocument(doc, { preview: false });

			}
		}

		return undefined;
	}

	async openDisplayTab(): Promise<void> {
		if (this.lesson.display) {

			try {
				// Use the existing command that already handles all the VNC URL resolution logic
				await vscode.commands.executeCommand('jointheleague.openVirtualDisplay');
				// Move to the right group after opening
				return vscode.commands.executeCommand('workbench.action.moveEditorToRightGroup');
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to execute commands: ${error}`);
			}
		}
	}

	async openTerminalTab(): Promise<vscode.Terminal | undefined> {
		if (this.lesson.terminal) {
			const terminal: vscode.Terminal = vscode.window.createTerminal('Lesson Terminal');
			terminal.show();
			return terminal;
		}

		return undefined;
	}

	public async closeAllTabs(): Promise<void> {

		await vscode.workspace.saveAll(false);
		await vscode.commands.executeCommand('workbench.action.closeAllEditors'); // Maybe redundant?

		await vscode.commands.executeCommand('workbench.action.debug.stop');

		if (this.lessonTab) {
			vscode.window.tabGroups.close(this.lessonTab);
		}
		if (this.exerciseTab) {
			vscode.window.tabGroups.close(this.exerciseTab);
		}
		if (this.terminalTab) {
			vscode.window.tabGroups.close(this.terminalTab);
		}
		if (this.displayTab) {
			vscode.window.tabGroups.close(this.displayTab);
		}

		vscode.window.terminals.forEach(terminal => terminal.dispose());

		vscode.window.tabGroups.all.forEach(tabGroup => {
			tabGroup.tabs.forEach(tab => {
				vscode.window.tabGroups.close(tab);
			});
		});

	}

	/** Open all of the tabs we need to open, then wait for them to 
	 * appear in the tab group.
	 */
	public async openTabs(): Promise<void> {

		if (this.tabSpec.includes('LED')) {

			await vscode.commands.executeCommand('workbench.action.editorLayoutTwoRows')

			this.exerciseEditor = await this.openExerciseTab();

			this.lessonEditor = await this.openLessonTab();
			await vscode.commands.executeCommand('workbench.action.moveEditorToLastGroup');

			await this.openDisplayTab();
			await vscode.commands.executeCommand('workbench.action.moveEditorToLastGroup');

		} else if (this.tabSpec.includes('lED')) {

			await vscode.commands.executeCommand('workbench.action.editorLayoutTwoColumns')

			this.exerciseEditor = await this.openExerciseTab();


			await this.openDisplayTab();
			await vscode.commands.executeCommand('workbench.action.moveEditorToLastGroup');

		} else if (this.tabSpec.includes('Led')) {

			this.lessonEditor = await this.openLessonTab();

		} else {

			const lessonPromise = this.openLessonTab();
			const exercisePromise = this.openExerciseTab();
			const displayPromise = this.openDisplayTab();


			this.lessonEditor = await lessonPromise;
			this.exerciseEditor = await exercisePromise;
			await displayPromise;

		}

		const terminalPromise = this.openTerminalTab();
		this.terminal = await terminalPromise;

		await this.waitforTabs();

		//this.logTabs();

	}


	public async waitforTabs(expectedTabs: number = 0): Promise<void> {
		// Wait for all of the tabs we expect to be opened and recorded. For
		// one tab, this is almost instant, but for multiple tabs, it can take
		// 250ms

		if (expectedTabs === 0) {
			expectedTabs = this.nTabs;
		}

		const timeout = 1000;
		const interval = 50;
		const start = Date.now();

		while (Date.now() - start < timeout) {
			if (vscode.window.tabGroups.all[0].tabs.length === expectedTabs) {
			
				break;
			}
		
			await new Promise(resolve => setTimeout(resolve, interval));
		}

		// Now we can visit the tabs and categorize them. 

		vscode.window.tabGroups.all[0].tabs.forEach((tab, tabIndex) => {
			// console.log(`  Tab ${tabIndex}: ${tab.label}`);
			if (tab.input instanceof vscode.TabInputText) {
				//console.log(`    URI (T): ${tab.input.uri.toString()}`);
				this.exerciseTab = tab;
			} else if (tab.input instanceof vscode.TabInputNotebook) {
				//console.log(`    URI (N): ${tab.input.uri.toString()}`);
				this.lessonTab = tab;
			} else if (tab.input instanceof vscode.TabInputWebview && tab.input.viewType.includes('markdown.preview')) {
				//console.log(`    URI (Mark): ${tab.input.viewType}`);
				this.lessonTab = tab;
			} else if (tab.input instanceof vscode.TabInputWebview && tab.input.viewType.includes('simpleBrowser')) {
				//console.log(`    URI (VD): ${tab.input.viewType}`);
				this.displayTab = tab;
			} else if (tab.input instanceof vscode.TabInputTerminal) {
				//console.log(`    URI (Term): `);
				this.terminalTab = tab;
			}

		});
	}

	public logTabs(): void {
		console.log(`Tabs: ${this.tabSpec}`);
		console.log(`  Lesson: ${this.lessonTab?.label}`);
		console.log(`  Exercise: ${this.exerciseTab?.label}`);
		console.log(`  Display: ${this.displayTab?.label}`);
		console.log(`  Terminal: ${this.terminalTab?.label}`);
	}

	/** Return true if the tab spec string matches which tabs are open. 
	 * 
	 */
	public areTabsOpen(tabString: string): boolean {
		const tabs: { [key: string]: vscode.Tab | undefined } = {
			"L": this.lessonTab,
			"l": this.lessonTab,
			"E": this.exerciseTab,
			"e": this.exerciseTab,
			"D": this.displayTab,
			"d": this.displayTab,
			"T": this.terminalTab,
			"t": this.terminalTab
		};

		const match = (char: string): boolean => {
			if (char === char.toUpperCase()) {
				return tabs[char] !== undefined;
			} else {
				return tabs[char] === undefined;
			}
		};

		let r: boolean[] = tabString.split('').map(char => match(char));
		let allTrue: boolean = r.every(value => value === true);

		//console.log(`areTabsOpen ${tabString}: ${allTrue} (${r})`);

		return allTrue

	}




	//await vscode.commands.executeCommand('workbench.action.moveEditorToAboveGroup');
	//await vscode.commands.executeCommand('workbench.action.moveEditorToRightGroup');



}
