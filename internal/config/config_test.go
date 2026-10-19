package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadOrCreateSecretIsStable(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state", "signing-secret")
	first, err := loadOrCreateSecret(path)
	if err != nil {
		t.Fatal(err)
	}
	second, err := loadOrCreateSecret(path)
	if err != nil {
		t.Fatal(err)
	}
	if first == "" || first != second {
		t.Fatalf("secret changed between reads: %q then %q", first, second)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("secret permissions = %o, want 600", info.Mode().Perm())
	}
}
