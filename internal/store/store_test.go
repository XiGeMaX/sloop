package store

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestOpenCreatesPrivateDatabaseFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sloop.db")
	database, err := Open(t.Context(), path)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if permissions := info.Mode().Perm(); permissions != 0o600 {
		t.Fatalf("database permissions = %o, want 600", permissions)
	}
}

func TestCreateCalendarLimit(t *testing.T) {
	ctx := context.Background()
	database, err := Open(ctx, filepath.Join(t.TempDir(), "sloop.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	userID := "test-admin-id-000000"
	_, err = database.Register(ctx, Registration{
		ID:               userID,
		Username:         "admin",
		Nickname:         "Admin",
		PasswordHash:     "hash",
		PasswordSalt:     "salt",
		CreatedAt:        "2026-10-18T00:00:00.000Z",
		RegisteredAtUnix: time.Date(2026, 10, 18, 0, 0, 0, 0, time.UTC).Unix(),
		SessionTokenHash: "session",
		SessionExpiresAt: 9999999999,
	})
	if err != nil {
		t.Fatal(err)
	}

	for index := 0; index < 50; index++ {
		_, err := database.CreateCalendar(
			ctx,
			userID,
			fmt.Sprintf("calendar-id-%03d", index),
			fmt.Sprintf("Cycle %d", index),
			`{"title":"Cycle","timezone":"Asia/Shanghai","durationMonths":12,"cycle":[]}`,
			fmt.Sprintf("share-slug-%03d", index),
			"2026-10-18T00:00:00.000Z",
		)
		if err != nil {
			t.Fatalf("create calendar %d: %v", index, err)
		}
	}

	_, err = database.CreateCalendar(
		ctx,
		userID,
		"calendar-limit",
		"Over limit",
		`{"title":"Cycle","timezone":"Asia/Shanghai","durationMonths":12,"cycle":[]}`,
		"share-slug-limit",
		"2026-10-18T00:00:00.000Z",
	)
	if !errors.Is(err, ErrCalendarLimit) {
		t.Fatalf("51st calendar error = %v, want ErrCalendarLimit", err)
	}
}

func TestRegisterUsesProvidedClockForInviteExpiry(t *testing.T) {
	ctx := context.Background()
	database, err := Open(ctx, filepath.Join(t.TempDir(), "sloop.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

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

	expiresAt := time.Now().Add(24 * time.Hour).Unix()
	_, err = database.CreateInvite(
		ctx,
		"invite-id-000000000",
		"CLOCK-TEST",
		"admin-id-0000000000",
		"Admin",
		1,
		&expiresAt,
		fixed.Format("2006-01-02T15:04:05.000Z"),
	)
	if err != nil {
		t.Fatal(err)
	}

	registeredAt := time.Unix(expiresAt+3600, 0).UTC()
	_, err = database.Register(ctx, Registration{
		ID:               "member-id-000000000",
		Username:         "member",
		Nickname:         "Member",
		PasswordHash:     "hash",
		PasswordSalt:     "salt",
		InviteCode:       "CLOCK-TEST",
		CreatedAt:        registeredAt.Format("2006-01-02T15:04:05.000Z"),
		RegisteredAtUnix: registeredAt.Unix(),
		SessionTokenHash: "member-session",
		SessionExpiresAt: registeredAt.Add(24 * time.Hour).Unix(),
	})
	if !errors.Is(err, ErrInvalidInvite) {
		t.Fatalf("expired invite error = %v, want ErrInvalidInvite", err)
	}
}

func TestUpdateCalendarScopesOwnershipAndDeletion(t *testing.T) {
	ctx := context.Background()
	database, err := Open(ctx, filepath.Join(t.TempDir(), "sloop.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	fixed := time.Date(2026, 10, 18, 0, 0, 0, 0, time.UTC)
	for _, registration := range []Registration{
		{
			ID:               "admin-id-0000000000",
			Username:         "admin",
			Nickname:         "Admin",
			PasswordHash:     "hash",
			PasswordSalt:     "salt",
			CreatedAt:        fixed.Format("2006-01-02T15:04:05.000Z"),
			RegisteredAtUnix: fixed.Unix(),
			SessionTokenHash: "admin-session",
			SessionExpiresAt: fixed.Add(24 * time.Hour).Unix(),
		},
		{
			ID:               "member-id-000000000",
			Username:         "member",
			Nickname:         "Member",
			PasswordHash:     "hash",
			PasswordSalt:     "salt",
			CreatedAt:        fixed.Format("2006-01-02T15:04:05.000Z"),
			RegisteredAtUnix: fixed.Unix(),
			SessionTokenHash: "member-session",
			SessionExpiresAt: fixed.Add(24 * time.Hour).Unix(),
		},
	} {
		if _, err := database.Register(ctx, registration); err != nil {
			t.Fatal(err)
		}
	}

	const calendarID = "calendar-id-00000000"
	_, err = database.CreateCalendar(
		ctx,
		"admin-id-0000000000",
		calendarID,
		"Original",
		`{"title":"Original"}`,
		"share-slug-0000000000",
		fixed.Format("2006-01-02T15:04:05.000Z"),
	)
	if err != nil {
		t.Fatal(err)
	}

	err = database.UpdateCalendar(
		ctx,
		"member-id-000000000",
		calendarID,
		"Stolen",
		`{"title":"Stolen"}`,
		fixed.Add(time.Hour).Format("2006-01-02T15:04:05.000Z"),
	)
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("cross-user update error = %v, want ErrNotFound", err)
	}

	value, err := database.GetCalendar(ctx, calendarID, "admin-id-0000000000")
	if err != nil {
		t.Fatal(err)
	}
	if value.Title != "Original" {
		t.Fatalf("calendar title after cross-user update = %q, want Original", value.Title)
	}

	err = database.UpdateCalendar(
		ctx,
		"admin-id-0000000000",
		calendarID,
		"Updated",
		`{"title":"Updated"}`,
		fixed.Add(time.Hour).Format("2006-01-02T15:04:05.000Z"),
	)
	if err != nil {
		t.Fatal(err)
	}
	if err := database.DeleteCalendar(ctx, calendarID, "admin-id-0000000000"); err != nil {
		t.Fatal(err)
	}
	err = database.UpdateCalendar(
		ctx,
		"admin-id-0000000000",
		calendarID,
		"After delete",
		`{"title":"After delete"}`,
		fixed.Add(2*time.Hour).Format("2006-01-02T15:04:05.000Z"),
	)
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("update after delete error = %v, want ErrNotFound", err)
	}
}
