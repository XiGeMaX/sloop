package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/xigemax/sloop/internal/calendar"
	"github.com/xigemax/sloop/internal/security"
	"github.com/xigemax/sloop/internal/store"
)

type userView struct {
	ID         string  `json:"id"`
	Username   string  `json:"username"`
	Nickname   string  `json:"nickname"`
	Role       string  `json:"role"`
	Status     string  `json:"status"`
	CreatedAt  string  `json:"createdAt"`
	ApprovedAt *string `json:"approvedAt"`
}

type adminUserView struct {
	userView
	InviteCode    *string `json:"inviteCode"`
	CalendarCount int     `json:"calendarCount"`
}

func serializeUser(user store.User) userView {
	return userView{
		ID:         user.ID,
		Username:   user.Username,
		Nickname:   user.Nickname,
		Role:       user.Role,
		Status:     user.Status,
		CreatedAt:  user.CreatedAt,
		ApprovedAt: user.ApprovedAt,
	}
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) error {
	body, err := readJSON(w, r, 64_000)
	if err != nil {
		return err
	}
	username, err := calendar.NormalizeUsername(body["username"])
	if err != nil {
		return inputError(err)
	}
	password, err := calendar.NormalizePassword(body["password"])
	if err != nil {
		return inputError(err)
	}
	nickname, err := calendar.NormalizeNickname(body["nickname"])
	if err != nil {
		return inputError(err)
	}
	inviteCode, err := calendar.NormalizeInviteCode(body["inviteCode"])
	if err != nil {
		return inputError(err)
	}

	now := s.now().UTC()
	userID, err := security.NewToken(16)
	if err != nil {
		return err
	}
	salt, err := security.NewSalt()
	if err != nil {
		return err
	}
	passwordHash, err := security.HashPassword(password, salt)
	if err != nil {
		return err
	}
	sessionToken, err := security.NewToken(32)
	if err != nil {
		return err
	}
	expiresAt := now.Unix() + sessionMaxAge
	createdAt := formatTimestamp(now)

	result, err := s.store.Register(r.Context(), store.Registration{
		ID:               userID,
		Username:         username,
		Nickname:         nickname,
		PasswordHash:     passwordHash,
		PasswordSalt:     salt,
		InviteCode:       inviteCode,
		CreatedAt:        createdAt,
		SessionTokenHash: security.HashToken(sessionToken),
		SessionExpiresAt: expiresAt,
	})
	if err != nil {
		switch {
		case errors.Is(err, store.ErrUsernameExists):
			return &APIError{Status: http.StatusConflict, Code: "username_exists"}
		case errors.Is(err, store.ErrInvalidInvite):
			return &APIError{Status: http.StatusBadRequest, Code: "invalid_invite"}
		default:
			return err
		}
	}

	approved := result.User.Status == "approved"
	message := "awaiting_approval"
	if result.Bootstrap {
		message = "admin_created"
	} else if approved {
		message = "registered"
	}
	headers := http.Header{}
	if approved {
		setSessionCookie(w, r, sessionToken, sessionMaxAge)
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"user":      serializeUser(result.User),
		"bootstrap": result.Bootstrap,
		"message":   message,
	}, headers)
	return nil
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) error {
	body, err := readJSON(w, r, 64_000)
	if err != nil {
		return err
	}
	username, err := calendar.NormalizeUsername(body["username"])
	if err != nil {
		return inputError(err)
	}
	password, err := calendar.NormalizePassword(body["password"])
	if err != nil {
		return inputError(err)
	}

	user, err := s.store.FindUserByUsername(r.Context(), username)
	if errors.Is(err, store.ErrNotFound) ||
		(err == nil && !security.PasswordMatches(
			password,
			user.PasswordSalt,
			user.PasswordHash,
		)) {
		return &APIError{Status: http.StatusUnauthorized, Code: "invalid_credentials"}
	}
	if err != nil {
		return err
	}
	switch user.Status {
	case "pending":
		return &APIError{Status: http.StatusForbidden, Code: "account_pending"}
	case "rejected":
		return &APIError{Status: http.StatusForbidden, Code: "account_rejected"}
	case "disabled":
		return &APIError{Status: http.StatusForbidden, Code: "account_disabled"}
	}

	token, err := security.NewToken(32)
	if err != nil {
		return err
	}
	now := s.now().UTC()
	if err := s.store.CreateSession(
		r.Context(),
		security.HashToken(token),
		user.ID,
		formatTimestamp(now),
		now.Unix()+sessionMaxAge,
	); err != nil {
		return err
	}
	setSessionCookie(w, r, token, sessionMaxAge)
	writeJSON(w, http.StatusOK, map[string]any{"user": serializeUser(user)}, nil)
	return nil
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) error {
	token := sessionToken(r)
	if token != "" {
		if err := s.store.DeleteSession(r.Context(), security.HashToken(token)); err != nil {
			return err
		}
	}
	setSessionCookie(w, r, "", 0)
	writeEmpty(w, http.StatusNoContent, nil)
	return nil
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) error {
	user, found, err := s.currentUser(r.Context(), r)
	if err != nil {
		return err
	}
	var value any
	if found {
		value = serializeUser(user)
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": value}, nil)
	return nil
}

func (s *Server) handleProfileUpdate(w http.ResponseWriter, r *http.Request) error {
	user, err := s.requireUser(r.Context(), r)
	if err != nil {
		return err
	}
	body, err := readJSON(w, r, 64_000)
	if err != nil {
		return err
	}
	usernameValue := any(user.Username)
	if value, exists := body["username"]; exists {
		usernameValue = value
	}
	nicknameValue := any(user.Nickname)
	if value, exists := body["nickname"]; exists {
		nicknameValue = value
	}
	username, err := calendar.NormalizeUsername(usernameValue)
	if err != nil {
		return inputError(err)
	}
	nickname, err := calendar.NormalizeNickname(nicknameValue)
	if err != nil {
		return inputError(err)
	}
	if err := s.store.UpdateProfile(r.Context(), user.ID, username, nickname); err != nil {
		if errors.Is(err, store.ErrUsernameExists) {
			return &APIError{Status: http.StatusConflict, Code: "username_exists"}
		}
		return err
	}
	user.Username = username
	user.Nickname = nickname
	writeJSON(w, http.StatusOK, map[string]any{"user": serializeUser(user)}, nil)
	return nil
}

func (s *Server) handlePasswordChange(w http.ResponseWriter, r *http.Request) error {
	user, err := s.requireUser(r.Context(), r)
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
	currentPassword := stringFromJSON(body["currentPassword"])
	storedUser, err := s.store.FindUserByID(r.Context(), user.ID)
	if errors.Is(err, store.ErrNotFound) {
		return &APIError{Status: http.StatusNotFound, Code: "user_not_found"}
	}
	if err != nil {
		return err
	}
	if !security.PasswordMatches(
		currentPassword,
		storedUser.PasswordSalt,
		storedUser.PasswordHash,
	) {
		return &APIError{Status: http.StatusBadRequest, Code: "invalid_current_password"}
	}
	token := sessionToken(r)
	if token == "" {
		return &APIError{Status: http.StatusUnauthorized, Code: "authentication_required"}
	}
	salt, err := security.NewSalt()
	if err != nil {
		return err
	}
	passwordHash, err := security.HashPassword(newPassword, salt)
	if err != nil {
		return err
	}
	if err := s.store.ChangePassword(
		r.Context(),
		user.ID,
		passwordHash,
		salt,
		security.HashToken(token),
	); err != nil {
		return err
	}
	writeEmpty(w, http.StatusNoContent, nil)
	return nil
}

func (s *Server) handleGetShiftLibrary(w http.ResponseWriter, r *http.Request) error {
	user, err := s.requireUser(r.Context(), r)
	if err != nil {
		return err
	}
	presetsJSON, updatedAt, err := s.store.GetShiftLibrary(r.Context(), user.ID)
	if errors.Is(err, store.ErrNotFound) {
		writeJSON(w, http.StatusOK, map[string]any{
			"presets":   nil,
			"updatedAt": nil,
		}, nil)
		return nil
	}
	if err != nil {
		return err
	}
	raw, err := decodeJSONValue([]byte(presetsJSON))
	if err != nil {
		return &APIError{Status: http.StatusInternalServerError, Code: "shift_library_invalid"}
	}
	presets, err := calendar.NormalizeShiftLibrary(raw)
	if err != nil {
		return &APIError{Status: http.StatusInternalServerError, Code: "shift_library_invalid"}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"presets":   presets,
		"updatedAt": updatedAt,
	}, nil)
	return nil
}

func (s *Server) handlePutShiftLibrary(w http.ResponseWriter, r *http.Request) error {
	user, err := s.requireUser(r.Context(), r)
	if err != nil {
		return err
	}
	body, err := readJSON(w, r, 32_000)
	if err != nil {
		return err
	}
	presets, err := calendar.NormalizeShiftLibrary(body)
	if err != nil {
		return inputError(err)
	}
	presetsJSON, err := json.Marshal(presets)
	if err != nil {
		return err
	}
	updatedAt := formatTimestamp(s.now().UTC())
	if err := s.store.SaveShiftLibrary(
		r.Context(),
		user.ID,
		string(presetsJSON),
		updatedAt,
	); err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"presets":   presets,
		"updatedAt": updatedAt,
	}, nil)
	return nil
}

func (s *Server) currentUser(
	ctx context.Context,
	r *http.Request,
) (store.User, bool, error) {
	token := sessionToken(r)
	if token == "" || len(token) > 200 {
		return store.User{}, false, nil
	}
	user, err := s.store.FindSessionUser(
		ctx,
		security.HashToken(token),
		s.now().Unix(),
	)
	if errors.Is(err, store.ErrNotFound) {
		return store.User{}, false, nil
	}
	if err != nil {
		return store.User{}, false, err
	}
	return user, true, nil
}

func (s *Server) requireUser(
	ctx context.Context,
	r *http.Request,
) (store.User, error) {
	user, found, err := s.currentUser(ctx, r)
	if err != nil {
		return store.User{}, err
	}
	if !found {
		return store.User{}, &APIError{
			Status: http.StatusUnauthorized,
			Code:   "authentication_required",
		}
	}
	return user, nil
}

func (s *Server) requireAdmin(
	ctx context.Context,
	r *http.Request,
) (store.User, error) {
	user, err := s.requireUser(ctx, r)
	if err != nil {
		return store.User{}, err
	}
	if user.Role != "admin" {
		return store.User{}, &APIError{
			Status: http.StatusForbidden,
			Code:   "admin_required",
		}
	}
	return user, nil
}

func sessionToken(r *http.Request) string {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		return ""
	}
	return cookie.Value
}

func setSessionCookie(w http.ResponseWriter, r *http.Request, token string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   requestScheme(r) == "https",
		SameSite: http.SameSiteLaxMode,
		MaxAge:   maxAge,
	})
}

func formatTimestamp(value time.Time) string {
	return value.UTC().Format("2006-01-02T15:04:05.000Z")
}

func decodeJSONValue(data []byte) (any, error) {
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, fmt.Errorf("decoding JSON: %w", err)
	}
	return value, nil
}
