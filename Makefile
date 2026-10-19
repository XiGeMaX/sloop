GO ?= go
PNPM ?= pnpm

.PHONY: all build frontend dev admin test test-go test-frontend check \
	fmt fmt-check vet lint security docker-build clean

all: check build

build: frontend
	mkdir -p bin
	CGO_ENABLED=0 $(GO) build -trimpath -o bin/sloop ./cmd/sloop
	CGO_ENABLED=0 $(GO) build -trimpath -o bin/sloop-admin ./cmd/sloop-admin

frontend:
	$(PNPM) build

dev: frontend
	$(GO) run ./cmd/sloop

admin:
	$(GO) run ./cmd/sloop-admin

test: test-go test-frontend

test-go:
	$(GO) test ./...

test-frontend:
	$(PNPM) test:frontend

check: fmt-check vet test-go test-frontend frontend

fmt:
	gofmt -w cmd internal migrations

fmt-check:
	@test -z "$$(gofmt -l cmd internal migrations)" || \
		(echo "Go files need formatting; run 'make fmt'"; exit 1)

vet:
	$(GO) vet ./...

lint:
	golangci-lint run ./...

security:
	govulncheck ./...

docker-build:
	docker build -t sloop:local .

clean:
	rm -rf bin coverage.out
	rm -f public/app.bundle.js
