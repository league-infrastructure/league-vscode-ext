/**
 * Configuration for files that should be hidden from students.
 * This map will be used to update the "files.exclude" setting in VS Code.
 */
export const DEFAULT_FILE_EXCLUSIONS: Record<string, boolean> = {
    ".git": true,
    ".github": true,
    "**/.gitignore": true,
    ".gitattributes": true,
    ".pylintrc": true,
    ".vscode": true,
    ".yarn": true,
    ".devcontainer": true,
    "**/node_modules": true,
    "**/.ipynb_checkpoints": true,
    ".venv": true,
    ".lib": true,
    "**/.jtl": true,
    "requirements.txt": true,
    "**/.DS_Store": true,
    ".lessons": true
};