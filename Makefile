
.PHONY: setup build publish compile


VERSION := $(shell grep '"version":' package.json | sed 's/.*"version": "\(.*\)".*/\1/')


# Load VSCE_PAT (VS Code marketplace token) from env file or environment
VSCE_PAT ?= $(shell grep VSCE_PAT .env 2>/dev/null | cut -d '=' -f2 || echo $$VSCE_PAT)


ver:
	@echo $(VERSION)

build:
	npm run compile
	# vsce package # If installed globally, you can use this command directly
	npx @vscode/vsce package # Use npx to ensure the local version is used

push: build
	git commit --allow-empty -a -m "Release version $(VERSION)"
	git push
	git tag v$(VERSION) 
	git push --tags


publish: build
	@if [ -z "$(VSCE_PAT)" ]; then \
		echo "Error: VSCE_PAT is not set. Set it in .env file or as environment variable."; \
		exit 1; \
	fi
	npx @vscode/vsce publish --pat "$(VSCE_PAT)"
