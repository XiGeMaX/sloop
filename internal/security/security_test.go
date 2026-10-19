package security

import "testing"

func TestPasswordMatchesLegacyWorkerFormat(t *testing.T) {
	const (
		salt = "BwcHBwcHBwcHBwcHBwcHBw=="
		hash = "FwITI3eSO0ocRSd9ofDb2KSq27sIJvhFlfcqX+rBDHw="
	)
	if !PasswordMatches("legacy-password", salt, hash) {
		t.Fatal("legacy password hash did not match")
	}
	if PasswordMatches("wrong-password", salt, hash) {
		t.Fatal("incorrect password matched")
	}
}

func TestHashTokenMatchesLegacyWorkerFormat(t *testing.T) {
	const expected = "wQHpEUaclpFxBAtQ1wVDMTz5aP3vW6zHgHdvj7OZqzY="
	if actual := HashToken("session-token"); actual != expected {
		t.Fatalf("HashToken() = %q, want %q", actual, expected)
	}
}
