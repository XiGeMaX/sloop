// Package config loads the self-hosted server configuration from environment variables.
package config

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	defaultPort       = "2167"
	defaultTimezone   = "Asia/Shanghai"
	defaultDatabase   = "./data/sloop.db"
	defaultStaticDir  = "./public"
	defaultSecretName = "signing-secret"
)

// Config contains runtime settings for the HTTP server and SQLite database.
type Config struct {
	Addr            string
	DatabasePath    string
	StaticDir       string
	DefaultTimezone string
	SigningSecret   string
}

// Load reads configuration from the environment and creates a durable signing
// secret when LINK_SIGNING_SECRET is not set. The generated secret is stored
// beside the database so subscription URLs stay stable across restarts.
func Load() (Config, error) {
	addr := strings.TrimSpace(os.Getenv("SLOOP_ADDR"))
	if addr == "" {
		port := strings.TrimSpace(os.Getenv("PORT"))
		if port == "" {
			port = defaultPort
		}
		addr = ":" + port
	}

	databasePath := strings.TrimSpace(os.Getenv("SLOOP_DATABASE_PATH"))
	if databasePath == "" {
		databasePath = defaultDatabase
	}

	staticDir := strings.TrimSpace(os.Getenv("SLOOP_STATIC_DIR"))
	if staticDir == "" {
		staticDir = defaultStaticDir
	}
	if info, err := os.Stat(staticDir); err != nil {
		return Config{}, fmt.Errorf("checking static directory: %w", err)
	} else if !info.IsDir() {
		return Config{}, fmt.Errorf("static path %q is not a directory", staticDir)
	}

	timezone := strings.TrimSpace(os.Getenv("DEFAULT_TIMEZONE"))
	if timezone == "" {
		timezone = defaultTimezone
	}
	if _, err := time.LoadLocation(timezone); err != nil {
		return Config{}, fmt.Errorf("loading DEFAULT_TIMEZONE %q: %w", timezone, err)
	}

	secret := strings.TrimSpace(os.Getenv("LINK_SIGNING_SECRET"))
	if secret == "" {
		secretPath := strings.TrimSpace(os.Getenv("SLOOP_SECRET_FILE"))
		if secretPath == "" {
			secretPath = filepath.Join(filepath.Dir(databasePath), defaultSecretName)
		}
		var err error
		secret, err = loadOrCreateSecret(secretPath)
		if err != nil {
			return Config{}, err
		}
	}
	if secret == "" {
		return Config{}, errors.New("signing secret must not be empty")
	}

	return Config{
		Addr:            addr,
		DatabasePath:    databasePath,
		StaticDir:       staticDir,
		DefaultTimezone: timezone,
		SigningSecret:   secret,
	}, nil
}

func loadOrCreateSecret(path string) (string, error) {
	if data, err := os.ReadFile(path); err == nil {
		secret := strings.TrimSpace(string(data))
		if secret == "" {
			return "", fmt.Errorf("signing secret file %q is empty", path)
		}
		return secret, nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("reading signing secret: %w", err)
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return "", fmt.Errorf("creating secret directory: %w", err)
	}

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generating signing secret: %w", err)
	}
	secret := hex.EncodeToString(raw)

	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if errors.Is(err, os.ErrExist) {
		data, readErr := os.ReadFile(path)
		if readErr != nil {
			return "", fmt.Errorf("reading concurrently created signing secret: %w", readErr)
		}
		value := strings.TrimSpace(string(data))
		if value == "" {
			return "", fmt.Errorf("signing secret file %q is empty", path)
		}
		return value, nil
	}
	if err != nil {
		return "", fmt.Errorf("creating signing secret: %w", err)
	}
	defer file.Close()

	if _, err := file.WriteString(secret + "\n"); err != nil {
		return "", fmt.Errorf("writing signing secret: %w", err)
	}
	if err := file.Sync(); err != nil {
		return "", fmt.Errorf("syncing signing secret: %w", err)
	}
	return secret, nil
}
