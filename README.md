# League VSCode Extension

## Overview

The League Lesson Browser extension provides a sidebar webview for managing
Python lessons. It includes action buttons for common tasks such as running
Python scripts, stopping programs, and marking lessons as complete. The
Extension also simplifies the UI for students, organizes panels according to the
lesson structure. It is designed to work with League curriculum. 

![Screenshot](https://images.jointheleague.org/misc/codeserver-screen.png)


## Features

- **Webview for Action Buttons**: A sidebar webview that displays action buttons for common tasks such as running Python scripts, stopping programs, and marking lessons as complete.
- **Python File Detection**: Automatically detects open Python files and updates the webview accordingly.
- **Run and Debug**: Easily run and debug Python scripts with a single click. 
- **Focus Management**: Maintains focus on the lesson browser view after running or debugging scripts.

## Example

This extension is intended to work with League curriculum, for example, [Python
Apprentice](https://github.com/league-curriculum/Python-Apprentice). These
lessons have a [YAML format
syllabus](https://github.com/league-curriculum/Python-Apprentice/blob/master/.jtl/syllabus.yaml),
and are typically run on a [specific Docker
image](https://github.com/league-infrastructure/docker-codeserver-python) that
provides a NoVNC based virtual screen. 

## Configuration

If you are developing a lesson syllabus, set the `jtl.syllabus.dev` setting to
True, or set the `JTL_SYLLABUS_DEV` environment variable to True. This will
enable the development mode, which will prevent the extension from
re-configuring the UI and automatically opening the first lesson. 

The Syllabus file can be set with the `jtl.syllabus.path` setting, or the
`JTL_SYLLABUS` environment variable.


## License

This extension is licensed under the MIT License. See the LICENSE file for more details.

## Support

For any issues or feature requests, please open an issue on the [GitHub repository](https://github.com/your-repo/league-vscode-ext).
