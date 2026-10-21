package httpapi

import (
	"net/http"
	"strings"
	"testing"
)

func TestAdminCanDeleteMember(t *testing.T) {
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
	adminID := decodeObject(t, data)["user"].(map[string]any)["id"].(string)

	response, data = harness.requestWithClient(
		t,
		adminClient,
		http.MethodPost,
		"/api/admin/invites",
		map[string]any{"code": "DELETE-ME", "maxUses": 1},
		nil,
	)
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("create invite status = %d, body = %s", response.StatusCode, data)
	}

	memberClient := harness.newClient(t)
	response, data = harness.requestWithClient(
		t,
		memberClient,
		http.MethodPost,
		"/api/auth/register",
		map[string]any{
			"username":   "member",
			"password":   "member-password-123",
			"nickname":   "Member",
			"inviteCode": "DELETE-ME",
		},
		nil,
	)
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("register member status = %d, body = %s", response.StatusCode, data)
	}
	memberID := decodeObject(t, data)["user"].(map[string]any)["id"].(string)

	response, data = harness.requestWithClient(
		t,
		adminClient,
		http.MethodDelete,
		"/api/admin/users/"+adminID,
		nil,
		nil,
	)
	if response.StatusCode != http.StatusBadRequest ||
		!strings.Contains(string(data), `"cannot_delete_self"`) {
		t.Fatalf("self delete status = %d, body = %s", response.StatusCode, data)
	}

	response, _ = harness.requestWithClient(
		t,
		memberClient,
		http.MethodDelete,
		"/api/admin/users/"+adminID,
		nil,
		nil,
	)
	if response.StatusCode != http.StatusForbidden {
		t.Fatalf("member delete admin status = %d", response.StatusCode)
	}

	response, _ = harness.requestWithClient(
		t,
		adminClient,
		http.MethodDelete,
		"/api/admin/users/"+memberID,
		nil,
		nil,
	)
	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("delete member status = %d", response.StatusCode)
	}

	response, data = harness.requestWithClient(
		t,
		adminClient,
		http.MethodGet,
		"/api/admin/users",
		nil,
		nil,
	)
	if response.StatusCode != http.StatusOK ||
		strings.Contains(string(data), `"username":"member"`) {
		t.Fatalf("users after delete status = %d, body = %s", response.StatusCode, data)
	}
}
