import * as vscode from 'vscode';
import { DEFAULT_FILE_EXCLUSIONS } from './fileExclusions';

/**
 * Hides files according to the DEFAULT_FILE_EXCLUSIONS configuration.
 * Updates the workspace's "files.exclude" setting to hide common system files and folders
 * that students don't need to see.
 */
export async function hideFiles(): Promise<void> {
    const filesConfig = vscode.workspace.getConfiguration('files');
    const currentExclusions = filesConfig.get('exclude') as Record<string, boolean> || {};
    
    // Merge the current exclusions with our default ones, prioritizing our defaults
    const updatedExclusions = { ...currentExclusions, ...DEFAULT_FILE_EXCLUSIONS };
    
    // Update the configuration
    await filesConfig.update('exclude', updatedExclusions, vscode.ConfigurationTarget.Workspace);
    
    vscode.window.showInformationMessage('Files have been hidden from the file explorer');
}

/**
 * Unhides files that were hidden by the hideFiles function.
 * Removes only the exclusions defined in DEFAULT_FILE_EXCLUSIONS from the workspace's "files.exclude" setting.
 */
export async function unhideFiles(): Promise<void> {
    const filesConfig = vscode.workspace.getConfiguration('files');
    const currentExclusions = filesConfig.get('exclude') as Record<string, boolean> || {};
    
    // Create a new exclusion object with only the entries that are not in DEFAULT_FILE_EXCLUSIONS
    const updatedExclusions: Record<string, boolean> = {};
    
    Object.entries(currentExclusions).forEach(([key, value]) => {
        // Keep the entry only if it's not in our default exclusions
        if (DEFAULT_FILE_EXCLUSIONS[key] === undefined) {
            updatedExclusions[key] = value;
        }
    });
    
    // Update the configuration
    await filesConfig.update('exclude', updatedExclusions, vscode.ConfigurationTarget.Workspace);
    
    vscode.window.showInformationMessage('Hidden files are now visible in the file explorer');
}