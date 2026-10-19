package httpapi

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

func TestCalendarUpdatesDeletesAndSignedSubscriptions(t *testing.T) {
	harness := newTestHarness(t)
	response, data := harness.request(t, http.MethodPost, "/api/auth/register", map[string]any{
		"username": "admin",
		"password": "admin-password-123",
		"nickname": "Admin",
	}, nil)
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("register admin status = %d, body = %s", response.StatusCode, data)
	}

	created := make([]map[string]any, 0, 2)
	for index := 0; index < 2; index++ {
		response, data = harness.request(t, http.MethodPost, "/api/calendars", map[string]any{
			"title": "Cycle " + string(rune('A'+index)),
			"plan":  json.RawMessage(testPlan),
		}, nil)
		if response.StatusCode != http.StatusCreated {
			t.Fatalf("create calendar %d status = %d, body = %s", index, response.StatusCode, data)
		}
		created = append(created, decodeObject(t, data)["calendar"].(map[string]any))
	}

	memberPath := created[0]["subscriptionPath"].(string)
	response, data = harness.request(t, http.MethodGet, memberPath, nil, nil)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("member subscription status = %d, body = %s", response.StatusCode, data)
	}

	tamperedPath := memberPath[:len(memberPath)-1] + "x"
	response, _ = harness.request(t, http.MethodGet, tamperedPath, nil, nil)
	if response.StatusCode != http.StatusNotFound {
		t.Fatalf("tampered member subscription status = %d", response.StatusCode)
	}

	response, data = harness.request(
		t,
		http.MethodPut,
		"/api/calendars/"+created[0]["id"].(string),
		map[string]any{"title": "Updated cycle"},
		nil,
	)
	if response.StatusCode != http.StatusOK ||
		!strings.Contains(string(data), `"title":"Updated cycle"`) {
		t.Fatalf("update calendar status = %d, body = %s", response.StatusCode, data)
	}

	selectedIDs := created[1]["id"].(string)
	response, data = harness.request(
		t,
		http.MethodGet,
		"/api/merged-subscription?ids="+url.QueryEscape(selectedIDs),
		nil,
		nil,
	)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("merged subscription status = %d, body = %s", response.StatusCode, data)
	}
	mergedPath := decodeObject(t, data)["subscriptionPath"].(string)
	response, data = harness.request(t, http.MethodGet, mergedPath, nil, nil)
	if response.StatusCode != http.StatusOK ||
		!strings.Contains(string(data), "BEGIN:VCALENDAR") {
		t.Fatalf("merged calendar status = %d, body = %s", response.StatusCode, data)
	}

	parsed, err := url.Parse(mergedPath)
	if err != nil {
		t.Fatal(err)
	}
	query := parsed.Query()
	query.Set("sig", strings.Repeat("A", len(query.Get("sig"))))
	parsed.RawQuery = query.Encode()
	response, _ = harness.request(t, http.MethodGet, parsed.String(), nil, nil)
	if response.StatusCode != http.StatusNotFound {
		t.Fatalf("tampered merged selection status = %d", response.StatusCode)
	}

	response, _ = harness.request(
		t,
		http.MethodDelete,
		"/api/calendars/"+created[0]["id"].(string),
		nil,
		nil,
	)
	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("delete calendar status = %d", response.StatusCode)
	}
	response, _ = harness.request(t, http.MethodGet, memberPath, nil, nil)
	if response.StatusCode != http.StatusNotFound {
		t.Fatalf("deleted member subscription status = %d", response.StatusCode)
	}
}
