package store

import (
	"context"
	"testing"
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
