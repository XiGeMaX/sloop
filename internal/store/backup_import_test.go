package store

import (
	"context"
	"testing"
	"time"
)

func TestImportBackupRejectsInvalidSnapshotBeforeDeletingData(t *testing.T) {
	ctx := context.Background()
	database := openBackupTestStore(t)

	err := database.ImportBackup(ctx, BackupSnapshot{
		Format:  BackupFormat,
		Version: BackupVersion,
	})
	if err == nil {
		t.Fatal("ImportBackup accepted a snapshot without an administrator")
	}
	if _, err := database.FindUserByID(ctx, "admin-id-0000000000"); err != nil {
		t.Fatalf("existing data was removed: %v", err)
	}
}

func TestBackupPreservesLocaleAndDefaultsOlderBackups(t *testing.T) {
	ctx := context.Background()
	database := openBackupTestStore(t)
	if err := database.UpdateLocale(ctx, "admin-id-0000000000", "en"); err != nil {
		t.Fatal(err)
	}

	snapshot, err := database.ExportBackup(
		ctx,
		"Asia/Shanghai",
		time.Date(2026, 10, 18, 1, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatal(err)
	}
	if got := snapshot.Data.Users[0].Locale; got != "en" {
		t.Fatalf("exported locale = %q, want en", got)
	}

	snapshot.Data.Users[0].Locale = ""
	if err := database.ImportBackup(ctx, snapshot); err != nil {
		t.Fatal(err)
	}
	user, err := database.FindUserByID(ctx, "admin-id-0000000000")
	if err != nil {
		t.Fatal(err)
	}
	if user.Locale != "" {
		t.Fatalf("imported locale = %q, want empty", user.Locale)
	}
}
