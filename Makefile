URL ?=
OUTDIR ?= output

.PHONY: install build link fetch clean

install:
	npm install

build: install
	npx rolldown -c

link: build
	npm link

fetch: build
ifndef URL
	$(error URL is required. Usage: make fetch URL=https://example.com)
endif
	NODE_TLS_REJECT_UNAUTHORIZED=0 node dist/cli.js $(URL) -d $(OUTDIR)

clean:
	rm -rf dist node_modules
