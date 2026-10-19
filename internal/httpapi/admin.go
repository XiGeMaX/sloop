package httpapi

import (
	"crypto/rand"
	"errors"
	"math/big"
	"net/http"
	"time"

	"github.com/xigemax/sloop/internal/calendar"
	"github.com/xigemax/sloop/internal/security"
	"github.com/xigemax/sloop/internal/store"
)

func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.requireAdmin(r.Context(), r); err != nil {
		return err
	}
	users, err := s.store.ListUsers(r.Context())
	if err != nil {
		return err
	}
	response := make([]adminUserView, 0, len(users))
	for _, user := range users {
		response = append(response, adminUserView{
			userView:      serializeUser(user.User),
			InviteCode:    user.InviteCode,
			CalendarCount: user.CalendarCount,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": response}, nil)
	return nil
}

func (s *Server) handleAdminUserUpdate(
	w http.ResponseWriter,
	r *http.Request,
	userID string,
) error {
	admin, err := s.requireAdmin(r.Context(), r)
	if err != nil {
		return err
	}
	target, err := s.store.FindUserByID(r.Context(), userID)
	if errors.Is(err, store.ErrNotFound) {
		return &APIError{Status: http.StatusNotFound, Code: "user_not_found"}
	}
	if err != nil {
		return err
	}
	body, err := readJSON(w, r, 64_000)
	if err != nil {
		return err
	}
	status := target.Status
	if value, exists := body["status"]; exists {
		status = stringFromJSON(value)
	}
	role := target.Role
	if value, exists := body["role"]; exists {
		role = stringFromJSON(value)
	}
	if !oneOf(status, "pending", "approved", "rejected", "disabled") {
		return &APIError{Status: http.StatusBadRequest, Code: "invalid_status"}
	}
	if !oneOf(role, "admin", "user") {
		return &APIError{Status: http.StatusBadRequest, Code: "invalid_role"}
	}

	updated, err := s.store.UpdateUser(
		r.Context(),
		admin.ID,
		userID,
		status,
		role,
		formatTimestamp(s.now().UTC()),
	)
	switch {
	case errors.Is(err, store.ErrCannotModifySelf):
		return &APIError{Status: http.StatusBadRequest, Code: "cannot_modify_self"}
	case errors.Is(err, store.ErrLastAdmin):
		return &APIError{Status: http.StatusBadRequest, Code: "last_admin"}
	case errors.Is(err, store.ErrNotFound):
		return &APIError{Status: http.StatusNotFound, Code: "user_not_found"}
	case err != nil:
		return err
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"user": serializeUser(updated),
	}, nil)
	return nil
}

func (s *Server) handleAdminPasswordReset(
	w http.ResponseWriter,
	r *http.Request,
	userID string,
) error {
	admin, err := s.requireAdmin(r.Context(), r)
	if err != nil {
		return err
	}
	body, err := readJSON(w, r, 64_000)
	if err != nil {
		return err
	}
	newPassword, err := calendar.NormalizePassword(body["newPassword"])
	if err != nil {
		return inputError(err)
	}
	salt, err := security.NewSalt()
	if err != nil {
		return err
	}
	passwordHash, err := security.HashPassword(newPassword, salt)
	if err != nil {
		return err
	}
	err = s.store.ResetPassword(
		r.Context(),
		admin.ID,
		userID,
		passwordHash,
		salt,
	)
	switch {
	case errors.Is(err, store.ErrCannotResetSelf):
		return &APIError{Status: http.StatusBadRequest, Code: "cannot_reset_self"}
	case errors.Is(err, store.ErrNotFound):
		return &APIError{Status: http.StatusNotFound, Code: "user_not_found"}
	case err != nil:
		return err
	}
	writeEmpty(w, http.StatusNoContent, nil)
	return nil
}

func (s *Server) handleListInvites(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.requireAdmin(r.Context(), r); err != nil {
		return err
	}
	invites, err := s.store.ListInvites(r.Context())
	if err != nil {
		return err
	}
	type inviteView struct {
		ID          string `json:"id"`
		Code        string `json:"code"`
		MaxUses     int    `json:"maxUses"`
		Uses        int    `json:"uses"`
		ExpiresAt   *int64 `json:"expiresAt"`
		Disabled    bool   `json:"disabled"`
		CreatorName string `json:"creatorName"`
		CreatedAt   string `json:"createdAt"`
	}
	response := make([]inviteView, 0, len(invites))
	for _, invite := range invites {
		response = append(response, inviteView{
			ID:          invite.ID,
			Code:        invite.Code,
			MaxUses:     invite.MaxUses,
			Uses:        invite.Uses,
			ExpiresAt:   invite.ExpiresAt,
			Disabled:    invite.Disabled,
			CreatorName: invite.CreatorName,
			CreatedAt:   invite.CreatedAt,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"invites": response}, nil)
	return nil
}

func (s *Server) handleCreateInvite(w http.ResponseWriter, r *http.Request) error {
	admin, err := s.requireAdmin(r.Context(), r)
	if err != nil {
		return err
	}
	body, err := readJSON(w, r, 64_000)
	if err != nil {
		return err
	}
	code, err := calendar.NormalizeInviteCode(body["code"])
	if err != nil {
		return inputError(err)
	}
	if code == "" {
		code, err = randomInviteCode()
		if err != nil {
			return err
		}
	}
	maxUses := intFromJSON(body["maxUses"], 1)
	if maxUses < 1 {
		maxUses = 1
	}
	if maxUses > 100 {
		maxUses = 100
	}

	var expiresAt *int64
	if value := stringFromJSON(body["expiresAt"]); value != "" {
		timestamp, err := time.Parse(time.RFC3339Nano, value)
		if err != nil || !timestamp.After(s.now()) {
			return &APIError{Status: http.StatusBadRequest, Code: "invalid_expiry"}
		}
		unix := timestamp.Unix()
		expiresAt = &unix
	}

	id, err := security.NewToken(16)
	if err != nil {
		return err
	}
	now := formatTimestamp(s.now().UTC())
	invite, err := s.store.CreateInvite(
		r.Context(),
		id,
		code,
		admin.ID,
		admin.Nickname,
		maxUses,
		expiresAt,
		now,
	)
	if errors.Is(err, store.ErrInviteExists) {
		return &APIError{Status: http.StatusConflict, Code: "invite_exists"}
	}
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"invite": map[string]any{
			"id":          invite.ID,
			"code":        invite.Code,
			"maxUses":     invite.MaxUses,
			"uses":        invite.Uses,
			"expiresAt":   invite.ExpiresAt,
			"disabled":    invite.Disabled,
			"creatorName": invite.CreatorName,
			"createdAt":   invite.CreatedAt,
		},
	}, nil)
	return nil
}

func (s *Server) handleDisableInvite(
	w http.ResponseWriter,
	r *http.Request,
	inviteID string,
) error {
	if _, err := s.requireAdmin(r.Context(), r); err != nil {
		return err
	}
	err := s.store.DisableInvite(r.Context(), inviteID)
	if errors.Is(err, store.ErrNotFound) {
		return &APIError{Status: http.StatusNotFound, Code: "invite_not_found"}
	}
	if err != nil {
		return err
	}
	writeEmpty(w, http.StatusNoContent, nil)
	return nil
}

func randomInviteCode() (string, error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	result := make([]byte, 8)
	for index := range result {
		position, err := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		if err != nil {
			return "", err
		}
		result[index] = alphabet[position.Int64()]
	}
	return string(result), nil
}

func oneOf(value string, allowed ...string) bool {
	for _, candidate := range allowed {
		if value == candidate {
			return true
		}
	}
	return false
}
