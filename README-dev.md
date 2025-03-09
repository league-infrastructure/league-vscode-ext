

# League VSCode Extension

The extension provides a button to open a simpleBrowser on the url specified in VNC_URL environment variable and provides keystroke rate telemetry so the container can be shut down when it is idle. 


## Development

### Running the extension

run `npm install` then go to the launch menu and select `Run Extension`, selecting the variant for the  `test-server.py`  reciever, or for the main `cspawner` flask app, 
running locally on port 5000

## Packaging and distribution

The extension will be automatically packaged and released by a github action
when it is pushed. Before you push, you should update the version in the
package.json file, then create a tag with the version number. 

```bash
git tag -a v0.0.1 -m "Version 0.0.1"
git push origin v0.0.1
```

To Package manually: 

```bash
npm install -g vsce
vsce package
```

Then submit the .vsix file as a release on Github. 
https://github.com/league-infrastructure/league-vscode-ext/releases

After releasing, add the new version to the code-server package installation, such 
as https://github.com/league-infrastructure/docker-codeserver-python/blob/master/app/install-extensions.sh

## Building Lessons

It is easier  to build lessons when the explorer is set to sort files and
directories mixed together, rather than sorting directories first.

You can set this with this configuration: 

```json
{
	"explorer.sortOrder": "mixed"
}
```


### Course Structure

A course is composed modules ( directories) and modules contain lessons, which
may be single files or directories. The lesson types are: 

* .md, a Markdown file. Markdown files are rendered with the Markdown previewers
  in the main view, unless the file has the same name ( except for the
  extension) of a Python file, in which case it is previewed in the lower pane.  
* .ipynb, a Jupyter notebook. Jupyter notebooks have both renedered Markdown and executable code cells. 
* .py, a Python file. Python files are displayed in an editor. 
* directory, a directory containing a lesson. The directory may contain any of
  the above types, but is mostly used when a program need multiple files or has
  images or other resources.


Lesson files are sorted in the explorer view by their name, so you can control 
the order of the lessons by prefixing the names with numbers. When they are displayed, any
prefix numbers are removed.

For directories:

* if there is one .py file, it is displayed in the editor. If there are multiple .py files ..... tbd ... 
* If ther eis one `.md` file, it is displayed in the markdown previewer in the lower pane. 
  

When the user starts a lesson
