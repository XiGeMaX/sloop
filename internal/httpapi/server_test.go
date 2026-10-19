package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/xigemax/sloop/internal/store"
)

const testPlan = `{
  "v":2,
  "t":"轮转班表",
  "z":"Asia/Shanghai",
  "r":1,
  "i":1,
  "c":[
    ["w","白班","08:00","20:00","sky"],
    ["w","夜班","20:00","08:00","indigo"],
    ["o","休息","00:00","00:00","sage"]
  ]
}`

type testHarness struct {
	server *httptest.Server
	store  *store.Store
	client *http.Client
}

func newTestHarness(t *testing.T) *testHarness {
	t.Helper()
	directory := t.TempDir()
	staticDir := filepath.Join(directory, "public")
	if err := os.MkdirAll(staticDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(staticDir, "index.html"),
		[]byte("<!doctype html><title>Sloop</title>"),
		0o644,
	); err != nil {
		t.Fatal(err)
	}
	database, err := store.Open(context.Background(), filepath.Join(directory, "sloop.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		database.Close()
	})

	handler, err := New(Options{
		Store:           database,
		Secret:          "test-signing-secret-with-stable-value",
		DefaultTimezone: "Asia/Shanghai",
		StaticDir:       staticDir,
		Logger:          slog.New(slog.NewTextHandler(io.Discard, nil)),
		Now: func() time.Time {
			return time.Date(2026, 10, 18, 2, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	return &testHarness{
		server: server,
		store:  database,
		client: &http.Client{Jar: jar},
	}
}

func (h *testHarness) request(
	t *testing.T,
	method, path string,
	body any,
	headers map[string]string,
) (*http.Response, []byte) {
	t.Helper()
	return h.requestWithClient(t, h.client, method, path, body, headers)
}

func (h *testHarness) requestWithClient(
	t *testing.T,
	client *http.Client,
	method, path string,
	body any,
	headers map[string]string,
) (*http.Response, []byte) {
	t.Helper()
	var reader io.Reader
	if body != nil {
		switch typed := body.(type) {
		case string:
			reader = strings.NewReader(typed)
		default:
			data, err := json.Marshal(typed)
			if err != nil {
				t.Fatal(err)
			}
			reader = bytes.NewReader(data)
		}
	}
	request, err := http.NewRequest(method, h.server.URL+path, reader)
	if err != nil {
		t.Fatal(err)
	}
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	data, err := io.ReadAll(response.Body)
	if err != nil {
		response.Body.Close()
		t.Fatal(err)
	}
	response.Body.Close()
	return response, data
}

func (h *testHarness) newClient(t *testing.T) *http.Client {
	t.Helper()
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	return &http.Client{Jar: jar}
}

func decodeObject(t *testing.T, data []byte) map[string]any {
	t.Helper()
	var value map[string]any
	if err := json.Unmarshal(data, &value); err != nil {
		t.Fatalf("decode response %q: %v", data, err)
	}
	return value
}

func TestServerLifecycle(t *testing.T) {
	harness := newTestHarness(t)

	response, data := harness.request(t, http.MethodGet, "/api/health", nil, nil)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("health status = %d, body = %s", response.StatusCode, data)
	}
	health := decodeObject(t, data)
	if health["database"] != true || health["signingSecret"] != true {
		t.Fatalf("health = %#v", health)
	}

	response, data = harness.request(t, http.MethodPost, "/api/auth/register", map[string]any{
		"username": "Admin",
		"password": "old-password-123",
		"nickname": "管理员",
	}, nil)
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("register admin status = %d, body = %s", response.StatusCode, data)
	}
	registration := decodeObject(t, data)
	user := registration["user"].(map[string]any)
	if user["role"] != "admin" || registration["message"] != "admin_created" {
		t.Fatalf("registration = %#v", registration)
	}

	response, data = harness.request(t, http.MethodGet, "/api/auth/me", nil, nil)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("me status = %d, body = %s", response.StatusCode, data)
	}
	me := decodeObject(t, data)
	if me["user"].(map[string]any)["username"] != "admin" {
		t.Fatalf("me = %#v", me)
	}

	response, data = harness.request(t, http.MethodPost, "/api/calendars", map[string]any{
		"plan": json.RawMessage(testPlan),
	}, nil)
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("create calendar status = %d, body = %s", response.StatusCode, data)
	}
	created := decodeObject(t, data)["calendar"].(map[string]any)
	subscriptionPath := created["subscriptionPath"].(string)
	if !strings.HasPrefix(subscriptionPath, "/api/ics/") {
		t.Fatalf("subscription path = %q", subscriptionPath)
	}

	response, data = harness.request(t, http.MethodGet, subscriptionPath, nil, nil)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("subscription status = %d, body = %s", response.StatusCode, data)
	}
	if !strings.Contains(string(data), "BEGIN:VCALENDAR") ||
		!strings.Contains(string(data), "SUMMARY:夜班") {
		t.Fatalf("subscription body = %s", data)
	}

	response, _ = harness.request(
		t,
		http.MethodGet,
		"/api/ics/"+created["slug"].(string),
		nil,
		nil,
	)
	if response.StatusCode != http.StatusNotFound {
		t.Fatalf("unsigned subscription status = %d", response.StatusCode)
	}

	response, data = harness.request(t, http.MethodPost, "/api/admin/invites", map[string]any{
		"code":    "TEAM-2026",
		"maxUses": 2,
	}, map[string]string{"Origin": "https://evil.example"})
	if response.StatusCode != http.StatusForbidden {
		t.Fatalf("cross-origin invite status = %d, body = %s", response.StatusCode, data)
	}

	response, data = harness.request(t, http.MethodPost, "/api/admin/invites", map[string]any{
		"code":    "TEAM-2026",
		"maxUses": 2,
	}, nil)
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("create invite status = %d, body = %s", response.StatusCode, data)
	}

	memberJar, _ := cookiejar.New(nil)
	memberClient := &http.Client{Jar: memberJar}
	memberRequest := func(method, path string, body any) (*http.Response, []byte) {
		var reader io.Reader
		if body != nil {
			encoded, _ := json.Marshal(body)
			reader = bytes.NewReader(encoded)
		}
		request, err := http.NewRequest(method, harness.server.URL+path, reader)
		if err != nil {
			t.Fatal(err)
		}
		if body != nil {
			request.Header.Set("Content-Type", "application/json")
		}
		response, err := memberClient.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		data, _ := io.ReadAll(response.Body)
		response.Body.Close()
		return response, data
	}

	response, data = memberRequest(http.MethodPost, "/api/auth/register", map[string]any{
		"username":   "member",
		"password":   "member-password-123",
		"nickname":   "小林",
		"inviteCode": "TEAM-2026",
	})
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("member register status = %d, body = %s", response.StatusCode, data)
	}
	memberRegistration := decodeObject(t, data)
	if memberRegistration["message"] != "registered" {
		t.Fatalf("member registration = %#v", memberRegistration)
	}

	response, _ = memberRequest(http.MethodGet, "/api/admin/users", nil)
	if response.StatusCode != http.StatusForbidden {
		t.Fatalf("member admin access status = %d", response.StatusCode)
	}

	presets := map[string]any{
		"presets": []any{
			map[string]any{
				"id": "day", "kind": "work", "name": "白班",
				"start": "08:00", "end": "20:00", "tone": "sky",
			},
		},
	}
	response, data = memberRequest(http.MethodPut, "/api/shift-library", presets)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("save shift library status = %d, body = %s", response.StatusCode, data)
	}
	response, data = memberRequest(http.MethodGet, "/api/shift-library", nil)
	if response.StatusCode != http.StatusOK ||
		!strings.Contains(string(data), `"removable":true`) {
		t.Fatalf("get shift library status = %d, body = %s", response.StatusCode, data)
	}

	response, data = memberRequest(http.MethodPatch, "/api/auth/profile", map[string]any{
		"username": "new_member",
		"nickname": "新 昵称",
	})
	if response.StatusCode != http.StatusOK {
		t.Fatalf("profile update status = %d, body = %s", response.StatusCode, data)
	}

	response, data = memberRequest(http.MethodPatch, "/api/auth/password", map[string]any{
		"currentPassword": "member-password-123",
		"newPassword":     "new-password-456",
	})
	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("password change status = %d, body = %s", response.StatusCode, data)
	}
	response, _ = memberRequest(http.MethodPost, "/api/auth/logout", nil)
	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("logout status = %d", response.StatusCode)
	}
	response, _ = memberRequest(http.MethodPost, "/api/auth/login", map[string]any{
		"username": "new_member",
		"password": "member-password-123",
	})
	if response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("old password login status = %d", response.StatusCode)
	}
	response, _ = memberRequest(http.MethodPost, "/api/auth/login", map[string]any{
		"username": "new_member",
		"password": "new-password-456",
	})
	if response.StatusCode != http.StatusOK {
		t.Fatalf("new password login status = %d", response.StatusCode)
	}

	response, data = harness.request(t, http.MethodGet, "/api/admin/users", nil, nil)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("admin users status = %d, body = %s", response.StatusCode, data)
	}
	if !strings.Contains(string(data), `"calendarCount"`) {
		t.Fatalf("admin users body = %s", data)
	}

	response, data = harness.request(t, http.MethodGet, "/api/admin/backup", nil, nil)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("backup export status = %d, body = %s", response.StatusCode, data)
	}
	snapshot := decodeObject(t, data)
	if snapshot["format"] != "sloop-backup" {
		t.Fatalf("backup = %#v", snapshot)
	}

	response, data = harness.request(t, http.MethodPost, "/api/admin/backup", snapshot, nil)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("backup import status = %d, body = %s", response.StatusCode, data)
	}
	importResult := decodeObject(t, data)
	if importResult["sessionsRevoked"] != true {
		t.Fatalf("backup import = %#v", importResult)
	}

	response, data = harness.request(t, http.MethodGet, "/api/auth/me", nil, nil)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("me after import status = %d, body = %s", response.StatusCode, data)
	}
	if decodeObject(t, data)["user"] != nil {
		t.Fatalf("session should have been revoked: %s", data)
	}
}

func TestInvalidBackupDoesNotReplaceData(t *testing.T) {
	harness := newTestHarness(t)
	response, data := harness.request(t, http.MethodPost, "/api/auth/register", map[string]any{
		"username": "admin",
		"password": "old-password-123",
		"nickname": "Admin",
	}, nil)
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("register status = %d, body = %s", response.StatusCode, data)
	}
	response, data = harness.request(t, http.MethodGet, "/api/admin/backup", nil, nil)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("backup status = %d, body = %s", response.StatusCode, data)
	}
	snapshot := decodeObject(t, data)
	users := snapshot["data"].(map[string]any)["users"].([]any)
	users[0].(map[string]any)["status"] = "disabled"

	response, data = harness.request(t, http.MethodPost, "/api/admin/backup", snapshot, nil)
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid backup status = %d, body = %s", response.StatusCode, data)
	}
	response, data = harness.request(t, http.MethodGet, "/api/admin/users", nil, nil)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("users after invalid backup status = %d, body = %s", response.StatusCode, data)
	}
	if !strings.Contains(string(data), `"status":"approved"`) {
		t.Fatalf("data changed after invalid backup: %s", data)
	}
}
