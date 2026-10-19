// Package security contains password, session, and subscription signing primitives.
package security

import (
	"crypto/hmac"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"fmt"
)

// PasswordIterations matches the existing stored password format.
const PasswordIterations = 100000

// NewSalt returns a 16-byte random password salt encoded as standard base64.
func NewSalt() (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", fmt.Errorf("generating password salt: %w", err)
	}
	return base64.StdEncoding.EncodeToString(value), nil
}

// HashPassword derives a 32-byte PBKDF2-SHA256 digest encoded as standard base64.
func HashPassword(password, saltBase64 string) (string, error) {
	salt, err := base64.StdEncoding.DecodeString(saltBase64)
	if err != nil {
		return "", fmt.Errorf("decoding password salt: %w", err)
	}
	digest, err := pbkdf2.Key(sha256.New, password, salt, PasswordIterations, 32)
	if err != nil {
		return "", fmt.Errorf("deriving password digest: %w", err)
	}
	return base64.StdEncoding.EncodeToString(digest), nil
}

// PasswordMatches compares a password against a stored digest in constant time.
func PasswordMatches(password, saltBase64, expectedHash string) bool {
	actualHash, err := HashPassword(password, saltBase64)
	if err != nil {
		return false
	}
	return ConstantTimeEqual(actualHash, expectedHash)
}

// NewToken returns a URL-safe random token.
func NewToken(byteLength int) (string, error) {
	value := make([]byte, byteLength)
	if _, err := rand.Read(value); err != nil {
		return "", fmt.Errorf("generating token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

// HashToken returns the standard-base64 SHA-256 digest stored in sessions.
func HashToken(token string) string {
	digest := sha256.Sum256([]byte(token))
	return base64.StdEncoding.EncodeToString(digest[:])
}

// SignBase64URL returns an HMAC-SHA256 signature encoded without padding.
func SignBase64URL(value, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(value))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// ConstantTimeEqual compares two strings without data-dependent early exit.
func ConstantTimeEqual(left, right string) bool {
	if len(left) != len(right) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(left), []byte(right)) == 1
}

// GenerateRecoveryPassword returns a temporary password suitable for manual login.
func GenerateRecoveryPassword() (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generating recovery password: %w", err)
	}
	return hex.EncodeToString(raw), nil
}
