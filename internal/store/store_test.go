package store

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"testing"
)

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
