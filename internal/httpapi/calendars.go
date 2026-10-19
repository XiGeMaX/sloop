package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"

	"github.com/xigemax/sloop/internal/calendar"
	"github.com/xigemax/sloop/internal/security"
	"github.com/xigemax/sloop/internal/store"
)

const (
	subscriptionLinkVersion = 2
	maxCalendarsPerUser     = 50
)

var (
	mergedCalendarIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{16,64}$`)
	mergedUserIDPattern     = regexp.MustCompile(`^[A-Za-z0-9_-]{16,64}$`)
)

type calendarView struct {
	ID               string `json:"id"`
	Title            string `json:"title"`
	Slug             string `json:"slug"`
	Plan             any    `json:"plan"`
	CreatedAt        string `json:"createdAt"`
	UpdatedAt        string `json:"updatedAt"`
	SubscriptionPath string `json:"subscriptionPath"`
}

func (s *Server) handleListCalendars(w http.ResponseWriter, r *http.Request) error {
	user, err := s.requireUser(r.Context(), r)
	if err != nil {
		return err
	}
	calendars, err := s.store.ListCalendars(r.Context(), user.ID)
	if err != nil {
		return err
	}
	response := make([]calendarView, 0, len(calendars))
	for _, value := range calendars {
		view, err := s.serializeCalendar(value)
		if err != nil {
			return err
		}
		response = append(response, view)
	}
	writeJSON(w, http.StatusOK, map[string]any{"calendars": response}, nil)
	return nil
}

func (s *Server) handleCreateCalendar(w http.ResponseWriter, r *http.Request) error {
	user, err := s.requireUser(r.Context(), r)
	if err != nil {
		return err
	}
	body, err := readJSON(w, r, 64_000)
	if err != nil {
		return err
	}
	plan, err := calendar.NormalizePlan(body["plan"], s.defaultTimezone)
	if err != nil {
		return inputError(err)
	}
	if title := calendar.CleanText(body["title"], 64, ""); title != "" {
		plan.Title = title
	}
	planJSON, err := json.Marshal(plan)
	if err != nil {
		return err
	}
	id, err := security.NewToken(16)
	if err != nil {
		return err
	}
	slug, err := security.NewToken(24)
	if err != nil {
		return err
	}
	now := formatTimestamp(s.now().UTC())
	value, err := s.store.CreateCalendar(
		r.Context(),
		user.ID,
		id,
		plan.Title,
		string(planJSON),
		slug,
		now,
	)
	if errors.Is(err, store.ErrCalendarLimit) {
		return &APIError{Status: http.StatusBadRequest, Code: "calendar_limit"}
	}
	if err != nil {
		return err
	}
	view, err := s.serializeCalendar(value)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, map[string]any{"calendar": view}, nil)
	return nil
}

func (s *Server) handleUpdateCalendar(
	w http.ResponseWriter,
	r *http.Request,
	calendarID string,
) error {
	user, err := s.requireUser(r.Context(), r)
	if err != nil {
		return err
	}
	existing, err := s.store.GetCalendar(r.Context(), calendarID, user.ID)
	if errors.Is(err, store.ErrNotFound) {
		return &APIError{Status: http.StatusNotFound, Code: "calendar_not_found"}
	}
	if err != nil {
		return err
	}
	body, err := readJSON(w, r, 64_000)
	if err != nil {
		return err
	}

	var plan calendar.Plan
	if bodyPlan, exists := body["plan"]; exists && bodyPlan != nil {
		plan, err = calendar.NormalizePlan(bodyPlan, s.defaultTimezone)
		if err != nil {
			return inputError(err)
		}
	} else {
		plan, err = store.PlanFromJSON(existing.PlanJSON, s.defaultTimezone)
		if err != nil {
			return &APIError{Status: http.StatusInternalServerError, Code: "calendar_data_invalid"}
		}
	}
	if title := calendar.CleanText(body["title"], 64, ""); title != "" {
		plan.Title = title
	}
	planJSON, err := json.Marshal(plan)
	if err != nil {
		return err
	}
	now := formatTimestamp(s.now().UTC())
	if err := s.store.UpdateCalendar(
		r.Context(),
		calendarID,
		plan.Title,
		string(planJSON),
		now,
	); err != nil {
		return err
	}
	existing.Title = plan.Title
	existing.PlanJSON = string(planJSON)
	existing.UpdatedAt = now
	view, err := s.serializeCalendar(existing)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, map[string]any{"calendar": view}, nil)
	return nil
}

func (s *Server) handleDeleteCalendar(
	w http.ResponseWriter,
	r *http.Request,
	calendarID string,
) error {
	user, err := s.requireUser(r.Context(), r)
	if err != nil {
		return err
	}
	err = s.store.DeleteCalendar(r.Context(), calendarID, user.ID)
	if errors.Is(err, store.ErrNotFound) {
		return &APIError{Status: http.StatusNotFound, Code: "calendar_not_found"}
	}
	if err != nil {
		return err
	}
	writeEmpty(w, http.StatusNoContent, nil)
	return nil
}

func (s *Server) handleMergedSubscription(w http.ResponseWriter, r *http.Request) error {
	user, err := s.requireUser(r.Context(), r)
	if err != nil {
		return err
	}
	selectedIDs, err := normalizeMergedCalendarIDs(
		r.URL.Query().Get("ids"),
		http.StatusBadRequest,
	)
	if err != nil {
		return err
	}
	availableIDs, err := s.store.CalendarIDs(r.Context(), user.ID)
	if err != nil {
		return err
	}
	available := make(map[string]struct{}, len(availableIDs))
	for _, id := range availableIDs {
		available[id] = struct{}{}
	}
	for _, id := range selectedIDs {
		if _, exists := available[id]; !exists {
			return &APIError{Status: http.StatusNotFound, Code: "calendar_not_found"}
		}
	}

	token := user.ID + "." + s.mergedSubscriptionSignature(user.ID)
	query := ""
	if len(selectedIDs) > 0 {
		query = "?ids=" + url.QueryEscape(strings.Join(selectedIDs, ",")) +
			"&sig=" + s.mergedSelectionSignature(user.ID, selectedIDs)
	}
	count := len(selectedIDs)
	if count == 0 {
		count = len(available)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"subscriptionPath": "/api/ics/merged/" + token + query,
		"calendarCount":    count,
	}, nil)
	return nil
}

func (s *Server) handleMemberCalendar(
	w http.ResponseWriter,
	r *http.Request,
	token string,
) error {
	separator := strings.LastIndex(token, ".")
	shareSlug := ""
	signature := ""
	if separator > 0 {
		shareSlug = token[:separator]
		signature = token[separator+1:]
	}
	expected := ""
	if shareSlug != "" {
		expected = s.memberSubscriptionSignature(shareSlug)
	}
	if shareSlug == "" || !security.ConstantTimeEqual(signature, expected) {
		return &APIError{Status: http.StatusNotFound, Code: "calendar_not_found"}
	}
	value, err := s.store.GetCalendarBySlug(r.Context(), shareSlug)
	if errors.Is(err, store.ErrNotFound) {
		return &APIError{Status: http.StatusNotFound, Code: "calendar_not_found"}
	}
	if err != nil {
		return err
	}
	plan, err := store.PlanFromJSON(value.PlanJSON, s.defaultTimezone)
	if err != nil {
		return &APIError{Status: http.StatusInternalServerError, Code: "calendar_data_invalid"}
	}
	includeRest := plan.IncludeRest
	content, err := calendar.BuildCalendar(plan, calendar.BuildOptions{
		Now:         s.now(),
		Months:      plan.DurationMonths,
		IncludeRest: &includeRest,
		DefaultTZ:   s.defaultTimezone,
	})
	if err != nil {
		return err
	}
	s.writeCalendarFile(w, r, content, plan.Title)
	return nil
}

func (s *Server) handleMergedCalendar(
	w http.ResponseWriter,
	r *http.Request,
	token string,
) error {
	separator := strings.Index(token, ".")
	userID := ""
	signature := ""
	if separator > 0 {
		userID = token[:separator]
		signature = token[separator+1:]
	}
	if !mergedUserIDPattern.MatchString(userID) || signature == "" ||
		!security.ConstantTimeEqual(signature, s.mergedSubscriptionSignature(userID)) {
		return &APIError{Status: http.StatusNotFound, Code: "merged_calendar_not_found"}
	}

	selectedIDs, err := normalizeMergedCalendarIDs(
		r.URL.Query().Get("ids"),
		http.StatusNotFound,
	)
	if err != nil {
		return err
	}
	if len(selectedIDs) > 0 {
		signature := r.URL.Query().Get("sig")
		if !security.ConstantTimeEqual(
			signature,
			s.mergedSelectionSignature(userID, selectedIDs),
		) {
			return &APIError{Status: http.StatusNotFound, Code: "merged_calendar_not_found"}
		}
	}
	status, err := s.store.UserStatus(r.Context(), userID)
	if errors.Is(err, store.ErrNotFound) || (err == nil && status != "approved") {
		return &APIError{Status: http.StatusNotFound, Code: "merged_calendar_not_found"}
	}
	if err != nil {
		return err
	}
	rows, err := s.store.ListCalendarsByUserID(r.Context(), userID)
	if err != nil {
		return err
	}
	selected := make(map[string]struct{}, len(selectedIDs))
	for _, id := range selectedIDs {
		selected[id] = struct{}{}
	}
	filtered := make([]calendar.CalendarRow, 0, len(rows))
	for _, value := range rows {
		if len(selected) > 0 {
			if _, exists := selected[value.ID]; !exists {
				continue
			}
		}
		filtered = append(filtered, calendar.CalendarRow{
			ID:        value.ID,
			ShareSlug: value.ShareSlug,
			PlanJSON:  value.PlanJSON,
		})
	}
	content, err := calendar.BuildMergedCalendar(filtered, calendar.BuildOptions{
		Now:       s.now(),
		DefaultTZ: s.defaultTimezone,
	})
	if err != nil {
		return err
	}
	s.writeCalendarFile(w, r, content, "Sloop 合并班表")
	return nil
}

func (s *Server) serializeCalendar(value store.Calendar) (calendarView, error) {
	plan, err := decodeJSONValue([]byte(value.PlanJSON))
	if err != nil {
		plan = nil
	}
	signature := s.memberSubscriptionSignature(value.ShareSlug)
	return calendarView{
		ID:               value.ID,
		Title:            value.Title,
		Slug:             value.ShareSlug,
		Plan:             plan,
		CreatedAt:        value.CreatedAt,
		UpdatedAt:        value.UpdatedAt,
		SubscriptionPath: "/api/ics/" + value.ShareSlug + "." + signature,
	}, nil
}

func (s *Server) memberSubscriptionSignature(slug string) string {
	return security.SignBase64URL(
		fmt.Sprintf("member-subscription:v%d:%s", subscriptionLinkVersion, slug),
		s.secret,
	)
}

func (s *Server) mergedSubscriptionSignature(userID string) string {
	return security.SignBase64URL(
		fmt.Sprintf("merged-subscription:v%d:%s", subscriptionLinkVersion, userID),
		s.secret,
	)
}

func (s *Server) mergedSelectionSignature(userID string, calendarIDs []string) string {
	return security.SignBase64URL(
		fmt.Sprintf(
			"merged-selection:v%d:%s:%s",
			subscriptionLinkVersion,
			userID,
			strings.Join(calendarIDs, ","),
		),
		s.secret,
	)
}

func normalizeMergedCalendarIDs(value string, errorStatus int) ([]string, error) {
	if value == "" {
		return nil, nil
	}
	parts := strings.Split(value, ",")
	if len(parts) > maxCalendarsPerUser {
		return nil, mergedSelectionError(errorStatus)
	}
	seen := make(map[string]struct{}, len(parts))
	ids := make([]string, 0, len(parts))
	for _, part := range parts {
		id := strings.TrimSpace(part)
		if id == "" {
			continue
		}
		if !mergedCalendarIDPattern.MatchString(id) {
			return nil, mergedSelectionError(errorStatus)
		}
		if _, exists := seen[id]; !exists {
			seen[id] = struct{}{}
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	return ids, nil
}

func mergedSelectionError(status int) error {
	if status == http.StatusNotFound {
		return &APIError{Status: status, Code: "merged_calendar_not_found"}
	}
	return &APIError{Status: status, Code: "invalid_calendar_selection"}
}

func (s *Server) writeCalendarFile(
	w http.ResponseWriter,
	r *http.Request,
	content, title string,
) {
	setCalendarCORSHeaders(w)
	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	disposition := "inline"
	if r.URL.Query().Get("download") == "1" {
		disposition = "attachment"
	}
	filename := url.PathEscape(title + ".ics")
	w.Header().Set(
		"Content-Disposition",
		fmt.Sprintf(`%s; filename="shift-cycle.ics"; filename*=UTF-8''%s`, disposition, filename),
	)
	w.Header().Set("Cache-Control", "private, max-age=300")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Robots-Tag", "noindex, nofollow, noarchive")
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		_, _ = w.Write([]byte(content))
	}
}

func setCalendarCORSHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}
