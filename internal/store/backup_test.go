package store

import (
	"context"
	"path/filepath"
	"testing"
	"time"
)

func openBackupTestStore(t *testing.T) *Store {
	t.Helper()
	ctx := context.Background()
	database, err := Open(ctx, filepath.Join(t.TempDir(), "sloop.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		database.Close()
	})

	fixed := time.Date(2026, 10, 18, 0, 0, 0, 0, time.UTC)
	_, err = database.Register(ctx, Registration{
		ID:               "admin-id-0000000000",
		Username:         "admin",
		Nickname:         "Admin",
		PasswordHash:     "hash",
		PasswordSalt:     "salt",
		CreatedAt:        fixed.Format("2006-01-02T15:04:05.000Z"),
		RegisteredAtUnix: fixed.Unix(),
		SessionTokenHash: "admin-session",
		SessionExpiresAt: fixed.Add(24 * time.Hour).Unix(),
	})
	if err != nil {
		t.Fatal(err)
	}
	return database
}

func TestExportBackupRejectsInvalidCalendarData(t *testing.T) {
	ctx := context.Background()
	database := openBackupTestStore(t)

	_, err := database.CreateCalendar(
		ctx,
		"admin-id-0000000000",
		"calendar-id-00000000",
		"Broken",
		`{"cycle":[{"kind":"work","name":"Day","start":"09:00","end":"18:00","tone":"sky"}]} trailing`,
		"share-slug-0000000000",
		"2026-10-18T00:00:00.000Z",
	)
	if err != nil {
		t.Fatal(err)
	}

	_, err = database.ExportBackup(
		ctx,
		"Asia/Shanghai",
		time.Date(2026, 10, 18, 1, 0, 0, 0, time.UTC),
	)
	if err == nil {
		t.Fatal("ExportBackup succeeded with invalid calendar JSON")
	}
	assertStoreRemainsUsable(t, database)
}

func TestExportBackupRejectsInvalidShiftLibraryData(t *testing.T) {
	ctx := context.Background()
	database := openBackupTestStore(t)

	if err := database.SaveShiftLibrary(
		ctx,
		"admin-id-0000000000",
		`{"presets":`,
		"2026-10-18T00:00:00.000Z",
	); err != nil {
		t.Fatal(err)
	}

	_, err := database.ExportBackup(
		ctx,
		"Asia/Shanghai",
		time.Date(2026, 10, 18, 1, 0, 0, 0, time.UTC),
	)
	if err == nil {
		t.Fatal("ExportBackup succeeded with invalid shift library JSON")
	}
	assertStoreRemainsUsable(t, database)
}

func assertStoreRemainsUsable(t *testing.T, database *Store) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, err := database.FindUserByID(ctx, "admin-id-0000000000"); err != nil {
		t.Fatalf("store unusable after failed export: %v", err)
	}
}
