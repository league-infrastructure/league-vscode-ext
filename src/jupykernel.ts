// Below from https://raw.githubusercontent.com/DonJayamanne/vscode-default-python-kernel/refs/heads/main/src/extension.ts, 
// Copyright (c) Don Jayamanne. All rights reserved.
// This method is called when your extension is activated


/**

This extension automatically selects the active Python Environment as a Kernel
for a Jupyter Notebook opened in VS Code.

This is useful when you have multiple Python environments and want to use the
one that is currently selected in the Python extension, by passing the Kernel
Picker entirely.

## Note:
* To set the active Python environment use the command `Python: Select
  Interpreter`.
* Automatic selection works only for the first time a notebook is opened (once
  this extension has been installed).
    * I.e. if you change the active Python environment after opening a notebook,
      the Kernel will not be changed.
    * Or if you open a notebook and then change the active Python environment,
      the Kernel will not be changed.
* Similarly if you change the kernel manually, the kernel will never be changed
  automatically again.
* If working on non-Python kernels in other workspaces, the suggestion is to
  disable this extension in those workspaces.


 */


import { ExtensionContext, Uri, commands, extensions, window, workspace } from 'vscode';
import * as fs from 'fs-extra';
import { EnvironmentPath, PythonExtension } from '@vscode/python-extension';

type JupyterApi = {
    openNotebook(uri: Uri, env: EnvironmentPath): Promise<void>;
};

// Your extension is activated the very first time the command is executed
export async function activateJupyterDefault(context: ExtensionContext) {
    const outputChannel = window.createOutputChannel('Default Python Kernel', { log: true });
    if (!(await fs.pathExists(context.globalStorageUri.fsPath))) {
        await fs.ensureDir(context.globalStorageUri.fsPath);
    }
    const pythonApi = PythonExtension.api();
    workspace.onDidOpenNotebookDocument(
        async (e) => {
            if (e.notebookType !== 'jupyter-notebook') {
                return;
            }
            const activeEnvPromise = pythonApi.then((api) => api.environments.getActiveEnvironmentPath(e.uri));
            const hash = await computeHash(e.uri.fsPath, 'SHA-512');
            const cachePath = Uri.joinPath(context.globalStorageUri, `${hash}.txt`);
            if (await fs.pathExists(cachePath.fsPath)) {
                // We've changed the kernel before, so we need to change it back
                outputChannel.info(`Not changing kernel for ${e.uri.fsPath} because we have changed it before`);
                return;
            }
            const activeEnv = await activeEnvPromise;
            if (!activeEnv) {
                outputChannel.info(`Not changing kernel for ${e.uri.fsPath} as there is not active Python Environment`);
                return;
            }
            outputChannel.info(`Changing kernel for ${e.uri.fsPath} to ${activeEnv.id}`);
            extensions
                .getExtension<JupyterApi>('ms-toolsai.jupyter')
                ?.exports?.openNotebook(e.uri, activeEnv)
                .then(() => {
                    fs.appendFile(cachePath.fsPath, '').catch((ex) => {
                        outputChannel.error(`Failed to write to cache ${cachePath.fsPath}`, ex);
                    });
                })
                .catch((ex) =>
                    outputChannel.error(`Failed to change kernel for ${e.uri.fsPath} to ${activeEnv.id}`, ex)
                );
        },
        undefined,
        context.subscriptions
    );
}

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Computes a hash for a give string and returns hash as a hex value.
 */
export async function computeHash(data: string, algorithm: 'SHA-512' | 'SHA-256' | 'SHA-1'): Promise<string> {
    const inputBuffer = new TextEncoder().encode(data);
    const hashBuffer = await require('node:crypto').webcrypto.subtle.digest({ name: algorithm }, inputBuffer);

    // Turn into hash string (got this logic from https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest)
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}