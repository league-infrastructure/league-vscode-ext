

# League VSCode Extension

The extension:

* provides a butoon to open a simpleBrowser on the url specified in VNC_URL environment variable

## Running the example

run `npm install` then go to the launch menu and select `Run Extension`. 


## Packaging and distribution


```bash
npm install -g vsce
vsce package
```

Then submit the .vsix file as a release on Github. 
https://github.com/league-infrastructure/league-vscode-ext/releases


Finally, add the new version to the code-server package installation, such 
as https://github.com/league-infrastructure/docker-codeserver-python/blob/master/app/install-extensions.sh


