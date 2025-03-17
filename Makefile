
.PHONY: setup build publish compile


VERSION := $(shell grep '"version":' package.json | sed 's/.*"version": "\(.*\)".*/\1/')


ver:
	@echo $(VERSION)

build:
	npm run compile
	vsce package

push: build
	git commit --allow-empty -a -m "Release version $(VERSION)"
	git push
	git tag v$(VERSION) 
	git push --tags


