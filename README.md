

# League VSCode Extension

The extension provides a button to open a simpleBrowser on the url specified in VNC_URL environment variable and provides keystroke rate telemetry so the container can be shut down when it is idle. 


## Development

### Running the extension

run `npm install` then go to the launch menu and select `Run Extension`. 

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


