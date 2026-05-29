# DFIR Agent — Build Makefile
# ============================
# Builds portable STATIC binaries — no runtime dependencies, no installer.
# CGO_ENABLED=0 ensures a fully self-contained binary that runs on any
# Windows/Linux system regardless of installed runtime libraries.

BINARY  = dfir-agent
VERSION = 1.1.0
LDFLAGS = -s -w -extldflags=-static -X main.Version=$(VERSION)

.PHONY: all windows linux darwin clean help test vet package

help:
	@echo "DFIR Agent build targets:"
	@echo "  make all              Build Windows + Linux binaries"
	@echo "  make windows          Build Windows amd64 + arm64"
	@echo "  make linux            Build Linux amd64 + arm64"
	@echo "  make darwin           Build macOS amd64 + arm64"
	@echo "  make package          Create Windows portable ZIP"
	@echo "  make test             Run tests"
	@echo "  make clean            Remove dist/"

all: windows linux

windows:
	mkdir -p dist
	GOOS=windows GOARCH=amd64 CGO_ENABLED=0 \
		go build -ldflags="$(LDFLAGS)" \
		-o dist/$(BINARY)-windows-amd64.exe ./cmd/agent/...
	GOOS=windows GOARCH=arm64 CGO_ENABLED=0 \
		go build -ldflags="$(LDFLAGS)" \
		-o dist/$(BINARY)-windows-arm64.exe ./cmd/agent/...
	cp dfir-agent.conf.example dist/dfir-agent.conf.example
	@echo ""
	@echo "Windows binaries built in dist/"
	@echo "  -> $(BINARY)-windows-amd64.exe"
	@echo "  -> dfir-agent.conf.example (rename to dfir-agent.conf before use)"

linux:
	mkdir -p dist
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 \
		go build -ldflags="$(LDFLAGS)" \
		-o dist/$(BINARY)-linux-amd64 ./cmd/agent/...
	GOOS=linux GOARCH=arm64 CGO_ENABLED=0 \
		go build -ldflags="$(LDFLAGS)" \
		-o dist/$(BINARY)-linux-arm64 ./cmd/agent/...
	@echo ""
	@echo "Linux binaries built in dist/"

darwin:
	mkdir -p dist
	GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 \
		go build -ldflags="$(LDFLAGS)" \
		-o dist/$(BINARY)-darwin-amd64 ./cmd/agent/...
	GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 \
		go build -ldflags="$(LDFLAGS)" \
		-o dist/$(BINARY)-darwin-arm64 ./cmd/agent/...

# Creates a ready-to-deploy Windows ZIP: binary + config template
package: windows
	cd dist && zip -j $(BINARY)-windows-portable-v$(VERSION).zip \
		$(BINARY)-windows-amd64.exe \
		dfir-agent.conf.example
	@echo "Package: dist/$(BINARY)-windows-portable-v$(VERSION).zip"
	@echo "Deploy: unzip, rename dfir-agent.conf.example to dfir-agent.conf, edit, run"

test:
	go test ./... -count=1

vet:
	go vet ./...

clean:
	rm -rf dist/
