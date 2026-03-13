.PHONY: help build build-all plan lint shellcheck

APP ?=

## help: List available commands
help:
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## //' | column -t -s ':'

## build: Build an app locally (e.g. make build APP=node-red-mcp)
build:
	cd apps/$(APP) && docker buildx bake image-local

## build-all: Build all platforms for an app
build-all:
	cd apps/$(APP) && docker buildx bake image

## plan: Print the bake plan for an app
plan:
	cd apps/$(APP) && docker buildx bake --print

## lint: Lint all Dockerfiles
lint:
	find apps -name Dockerfile -exec hadolint {} \;

## shellcheck: Lint shell scripts
shellcheck:
	find apps -name '*.sh' -exec shellcheck {} \;
