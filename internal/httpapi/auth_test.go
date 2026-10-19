package httpapi

import (
	"net/http"
	"strings"
	"testing"
)

func TestRegistrationApprovalAndLogin(t *testing.T) {
	harness := newTestHarness(t)
	adminClient := harness.newClient(t)

	response, data := harness.requestWithClient(
		t,
		adminClient,
		http.MethodPost,
		"/api/auth/register",
		map[string]any{
			"username": "admin",
			"password": "admin-password-123",
			"nickname": "Admin",
		},
		nil,
	)
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("register admin status = %d, body = %s", response.StatusCode, data)
	}

	memberClient := harness.newClient(t)
	response, data = harness.requestWithClient(
		t,
		memberClient,
		http.MethodPost,
		"/api/auth/register",
		map[string]any{
			"username": "pending",
			"password": "pending-password-123",
			"nickname": "Pending",
		},
		nil,
	)
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("register pending user status = %d, body = %s", response.StatusCode, data)
	}
	registration := decodeObject(t, data)
	if registration["message"] != "awaiting_approval" {
		t.Fatalf("registration = %#v", registration)
	}

	response, data = harness.requestWithClient(
		t,
		memberClient,
		http.MethodPost,
		"/api/auth/login",
		map[string]any{
			"username": "pending",
			"password": "pending-password-123",
		},
		nil,
	)
	if response.StatusCode != http.StatusForbidden ||
		!strings.Contains(string(data), `"account_pending"`) {
		t.Fatalf("pending login status = %d, body = %s", response.StatusCode, data)
	}

	response, data = harness.requestWithClient(
		t,
		adminClient,
		http.MethodGet,
		"/api/admin/users",
		nil,
		nil,
	)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("list users status = %d, body = %s", response.StatusCode, data)
	}
	var pendingID string
	for _, raw := range decodeObject(t, data)["users"].([]any) {
		user := raw.(map[string]any)
		if user["username"] == "pending" {
			pendingID = user["id"].(string)
			break
		}
	}
	if pendingID == "" {
		t.Fatal("pending user not found")
	}

	response, data = harness.requestWithClient(
		t,
		adminClient,
		http.MethodPatch,
		"/api/admin/users/"+pendingID,
		map[string]any{"status": "approved"},
		nil,
	)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("approve user status = %d, body = %s", response.StatusCode, data)
	}

	response, data = harness.requestWithClient(
		t,
		memberClient,
		http.MethodPost,
		"/api/auth/login",
		map[string]any{
			"username": "pending",
			"password": "pending-password-123",
		},
		nil,
	)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("approved login status = %d, body = %s", response.StatusCode, data)
	}
}

func TestInviteUsageLimit(t *testing.T) {
	harness := newTestHarness(t)
	adminClient := harness.newClient(t)
	response, data := harness.requestWithClient(
		t,
		adminClient,
		http.MethodPost,
		"/api/auth/register",
		map[string]any{
			"username": "admin",
			"password": "admin-password-123",
			"nickname": "Admin",
		},
		nil,
	)
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("register admin status = %d, body = %s", response.StatusCode, data)
	}

	response, data = harness.requestWithClient(
		t,
		adminClient,
		http.MethodPost,
		"/api/admin/invites",
		map[string]any{"code": "LIMIT-1", "maxUses": 1},
		nil,
	)
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("create invite status = %d, body = %s", response.StatusCode, data)
	}

	for index, username := range []string{"member1", "member2"} {
		client := harness.newClient(t)
		response, data = harness.requestWithClient(
			t,
			client,
			http.MethodPost,
			"/api/auth/register",
			map[string]any{
				"username":   username,
				"password":   "member-password-123",
				"nickname":   username,
				"inviteCode": "LIMIT-1",
			},
			nil,
		)
		if index == 0 && response.StatusCode != http.StatusCreated {
			t.Fatalf("first invited registration status = %d, body = %s", response.StatusCode, data)
		}
		if index == 1 &&
			(response.StatusCode != http.StatusBadRequest ||
				!strings.Contains(string(data), `"invalid_invite"`)) {
			t.Fatalf("exhausted invite status = %d, body = %s", response.StatusCode, data)
		}
	}

	response, data = harness.requestWithClient(
		t,
		adminClient,
		http.MethodGet,
		"/api/admin/invites",
		nil,
		nil,
	)
	if response.StatusCode != http.StatusOK ||
		!strings.Contains(string(data), `"uses":1`) {
		t.Fatalf("invite count status = %d, body = %s", response.StatusCode, data)
	}
}

func TestReadJSONRejectsTrailingData(t *testing.T) {
	harness := newTestHarness(t)
	response, data := harness.request(
		t,
		http.MethodPost,
		"/api/auth/register",
		`{"username":"admin","password":"admin-password-123","nickname":"Admin"}{}`,
		nil,
	)
	if response.StatusCode != http.StatusBadRequest ||
		!strings.Contains(string(data), `"invalid_json"`) {
		t.Fatalf("trailing JSON status = %d, body = %s", response.StatusCode, data)
	}
}
