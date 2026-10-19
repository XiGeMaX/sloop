package main

import (
	"bytes"
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/xigemax/sloop/internal/security"
	"github.com/xigemax/sloop/internal/store"
)

func createRecoveryTestDatabase(t *testing.T) (string, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "sloop.db")
	database, err := store.Open(context.Background(), path)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	salt, err := security.NewSalt()
	if err != nil {
		t.Fatal(err)
	}
	hash, err := security.HashPassword("original-password", salt)
	if err != nil {
		t.Fatal(err)
	}
	_, err = database.Register(context.Background(), store.Registration{
		ID:               "admin-id-0000000000",
		Username:         "admin",
		Nickname:         "Administrator",
		PasswordHash:     hash,
		PasswordSalt:     salt,
		CreatedAt:        "2026-10-18T00:00:00.000Z",
		RegisteredAtUnix: time.Date(2026, 10, 18, 0, 0, 0, 0, time.UTC).Unix(),
		SessionTokenHash: security.HashToken("existing-session"),
		SessionExpiresAt: 9999999999,
	})
	if err != nil {
		t.Fatal(err)
	}
	return path, hash
}

func TestRunResetsAdminPasswordAndRevokesSessions(t *testing.T) {
	databasePath, oldHash := createRecoveryTestDatabase(t)
	var output bytes.Buffer
	err := run(
		[]string{
			"--database", databasePath,
			"--username", "admin",
			"--password-stdin",
		},
		strings.NewReader("replacement-password"),
		&output,
	)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output.String(), `Password reset for "admin"`) {
		t.Fatalf("output = %q", output.String())
	}

	database, err := store.Open(context.Background(), databasePath)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	user, err := database.FindUserByUsername(context.Background(), "admin")
	if err != nil {
		t.Fatal(err)
	}
	if user.PasswordHash == oldHash {
		t.Fatal("password hash was not changed")
	}
	if !security.PasswordMatches(
		"replacement-password",
		user.PasswordSalt,
		user.PasswordHash,
	) {
		t.Fatal("replacement password does not match")
	}
	_, err = database.FindSessionUser(
		context.Background(),
		security.HashToken("existing-session"),
		9999999998,
	)
	if !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("old session lookup error = %v, want ErrNotFound", err)
	}
}

func TestRunPasswordStdinPreservesWhitespace(t *testing.T) {
	databasePath, _ := createRecoveryTestDatabase(t)
	var output bytes.Buffer
	const replacementPassword = "  spaced-password  "
	if err := run(
		[]string{
			"--database", databasePath,
			"--username", "admin",
			"--password-stdin",
		},
		strings.NewReader(replacementPassword+"\n"),
		&output,
	); err != nil {
		t.Fatal(err)
	}

	database, err := store.Open(context.Background(), databasePath)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	user, err := database.FindUserByUsername(context.Background(), "admin")
	if err != nil {
		t.Fatal(err)
	}
	if !security.PasswordMatches(
		replacementPassword,
		user.PasswordSalt,
		user.PasswordHash,
	) {
		t.Fatal("replacement password whitespace was not preserved")
	}
	if security.PasswordMatches(
		strings.TrimSpace(replacementPassword),
		user.PasswordSalt,
		user.PasswordHash,
	) {
		t.Fatal("trimmed replacement password unexpectedly matches")
	}
}

func TestRunListsApprovedAdmins(t *testing.T) {
	databasePath, _ := createRecoveryTestDatabase(t)
	var output bytes.Buffer
	if err := run(
		[]string{"--database", databasePath, "--list"},
		strings.NewReader(""),
		&output,
	); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output.String(), "admin\tAdministrator") {
		t.Fatalf("output = %q", output.String())
	}
}
