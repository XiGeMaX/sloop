// Package httpapi exposes the Sloop HTTP API and serves the web application.
package httpapi

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/xigemax/sloop/internal/store"
)

const (
	sessionCookieName = "sloop_session"
	sessionMaxAge     = 30 * 24 * 60 * 60
)

// Options configures the HTTP adapter.
type Options struct {
	Store           *store.Store
	Secret          string
	DefaultTimezone string
	StaticDir       string
	Logger          *slog.Logger
	Now             func() time.Time
}

// Server serves the Sloop API and static frontend.
type Server struct {
	store           *store.Store
	secret          string
	defaultTimezone string
	staticDir       string
	logger          *slog.Logger
	now             func() time.Time
	static          http.Handler
}

// New constructs the HTTP adapter.
func New(options Options) (*Server, error) {
	if options.Store == nil {
		return nil, errors.New("store is required")
	}
	if options.Secret == "" {
		return nil, errors.New("signing secret is required")
	}
	if options.DefaultTimezone == "" {
		options.DefaultTimezone = "Asia/Shanghai"
	}
	if options.StaticDir == "" {
		options.StaticDir = "./public"
	}
	if info, err := os.Stat(options.StaticDir); err != nil {
		return nil, fmt.Errorf("checking static directory: %w", err)
	} else if !info.IsDir() {
		return nil, fmt.Errorf("static path %q is not a directory", options.StaticDir)
	}
	if options.Logger == nil {
		options.Logger = slog.Default()
	}
	if options.Now == nil {
		options.Now = time.Now
	}

	absoluteStaticDir, err := filepath.Abs(options.StaticDir)
	if err != nil {
		return nil, fmt.Errorf("resolving static directory: %w", err)
	}
	return &Server{
		store:           options.Store,
		secret:          options.Secret,
		defaultTimezone: options.DefaultTimezone,
		staticDir:       absoluteStaticDir,
		logger:          options.Logger,
		now:             options.Now,
		static:          http.FileServer(http.Dir(absoluteStaticDir)),
	}, nil
}

// ServeHTTP applies security headers, request logging, API routing, and static
// file serving.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	startedAt := time.Now()
	recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
	s.setSecurityHeaders(recorder, r)
	defer func() {
		if recovered := recover(); recovered != nil {
			s.logger.Error("request_panic", "error", recovered)
			if !recorder.wroteHeader {
				writeAPIError(recorder, &APIError{
					Status: http.StatusInternalServerError,
					Code:   "server_error",
				}, s.logger)
			}
		}
		s.logger.Info(
			"http_request",
			"method", r.Method,
			"path", requestLogPath(r.URL.Path),
			"status", recorder.status,
			"duration_ms", time.Since(startedAt).Milliseconds(),
		)
	}()

	if strings.HasPrefix(r.URL.Path, "/api/") {
		s.handleAPI(recorder, r)
		return
	}
	if r.URL.Path == "/api" {
		writeAPIError(recorder, &APIError{Status: 404, Code: "not_found"}, s.logger)
		return
	}

	if r.URL.Path == "/" || strings.HasSuffix(r.URL.Path, ".html") {
		recorder.Header().Set("Cache-Control", "no-store")
	} else {
		recorder.Header().Set("Cache-Control", "public, max-age=3600")
	}
	s.static.ServeHTTP(recorder, r)
}

func (s *Server) handleAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		if strings.HasPrefix(r.URL.Path, "/api/ics/") {
			setCalendarCORSHeaders(w)
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", "same-origin")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !isSafeMethod(r.Method) && !sameOriginRequest(r) {
		writeAPIError(w, &APIError{Status: 403, Code: "cross_origin_request"}, s.logger)
		return
	}

	var err error
	switch {
	case r.Method == http.MethodGet && r.URL.Path == "/api/health":
		err = s.handleHealth(w, r)
	case r.URL.Path == "/api/guest-link" ||
		r.URL.Path == "/api/guest-export" ||
		r.URL.Path == "/api/guest.ics":
		err = &APIError{Status: http.StatusGone, Code: "guest_access_disabled"}
	case r.Method == http.MethodPost && r.URL.Path == "/api/auth/register":
		err = s.handleRegister(w, r)
	case r.Method == http.MethodPost && r.URL.Path == "/api/auth/login":
		err = s.handleLogin(w, r)
	case r.Method == http.MethodPost && r.URL.Path == "/api/auth/logout":
		err = s.handleLogout(w, r)
	case r.Method == http.MethodPatch && r.URL.Path == "/api/auth/profile":
		err = s.handleProfileUpdate(w, r)
	case r.Method == http.MethodPatch && r.URL.Path == "/api/auth/password":
		err = s.handlePasswordChange(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/api/auth/me":
		err = s.handleMe(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/api/shift-library":
		err = s.handleGetShiftLibrary(w, r)
	case r.Method == http.MethodPut && r.URL.Path == "/api/shift-library":
		err = s.handlePutShiftLibrary(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/api/merged-subscription":
		err = s.handleMergedSubscription(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/api/calendars":
		err = s.handleListCalendars(w, r)
	case r.Method == http.MethodPost && r.URL.Path == "/api/calendars":
		err = s.handleCreateCalendar(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/api/admin/users":
		err = s.handleListUsers(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/api/admin/backup":
		err = s.handleExportBackup(w, r)
	case r.Method == http.MethodPost && r.URL.Path == "/api/admin/backup":
		err = s.handleImportBackup(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/api/admin/invites":
		err = s.handleListInvites(w, r)
	case r.Method == http.MethodPost && r.URL.Path == "/api/admin/invites":
		err = s.handleCreateInvite(w, r)
	default:
		err = s.handleParameterizedRoute(w, r)
	}
	if err != nil {
		writeAPIError(w, err, s.logger)
	}
}

func (s *Server) handleParameterizedRoute(w http.ResponseWriter, r *http.Request) error {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) == 3 && parts[0] == "api" && parts[1] == "calendars" {
		switch r.Method {
		case http.MethodPut:
			return s.handleUpdateCalendar(w, r, parts[2])
		case http.MethodDelete:
			return s.handleDeleteCalendar(w, r, parts[2])
		}
	}
	if len(parts) == 5 && parts[0] == "api" && parts[1] == "admin" &&
		parts[2] == "users" && parts[4] == "password" && r.Method == http.MethodPatch {
		return s.handleAdminPasswordReset(w, r, parts[3])
	}
	if len(parts) == 4 && parts[0] == "api" && parts[1] == "admin" &&
		parts[2] == "users" && r.Method == http.MethodPatch {
		return s.handleAdminUserUpdate(w, r, parts[3])
	}
	if len(parts) == 4 && parts[0] == "api" && parts[1] == "admin" &&
		parts[2] == "invites" && r.Method == http.MethodDelete {
		return s.handleDisableInvite(w, r, parts[3])
	}
	if len(parts) == 4 && parts[0] == "api" && parts[1] == "ics" &&
		parts[2] == "merged" && (r.Method == http.MethodGet || r.Method == http.MethodHead) {
		return s.handleMergedCalendar(w, r, parts[3])
	}
	if len(parts) == 3 && parts[0] == "api" && parts[1] == "ics" &&
		(r.Method == http.MethodGet || r.Method == http.MethodHead) {
		return s.handleMemberCalendar(w, r, parts[2])
	}
	return &APIError{Status: http.StatusNotFound, Code: "not_found"}
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) error {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.store.Ping(ctx); err != nil {
		return &APIError{
			Status: http.StatusServiceUnavailable,
			Code:   "database_unavailable",
			Cause:  err,
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":            true,
		"database":      true,
		"signingSecret": s.secret != "",
	}, nil)
	return nil
}

func (s *Server) setSecurityHeaders(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Security-Policy",
		"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "+
			"script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; "+
			"base-uri 'self'; frame-ancestors 'none'; form-action 'self'")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
	if requestScheme(r) == "https" {
		w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
	}
}

func requestScheme(r *http.Request) string {
	if r.TLS != nil {
		return "https"
	}
	if forwarded := strings.TrimSpace(strings.Split(
		r.Header.Get("X-Forwarded-Proto"),
		",",
	)[0]); strings.EqualFold(forwarded, "https") {
		return "https"
	}
	return "http"
}

func sameOriginRequest(r *http.Request) bool {
	if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		return false
	}
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return true
	}
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Host == "" || parsed.User != nil {
		return false
	}
	return strings.EqualFold(parsed.Scheme, requestScheme(r)) &&
		strings.EqualFold(parsed.Host, r.Host)
}

func isSafeMethod(method string) bool {
	return method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions
}

func requestLogPath(path string) string {
	if strings.HasPrefix(path, "/api/ics/") {
		return "/api/ics/[redacted]"
	}
	return path
}

type statusRecorder struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

func (r *statusRecorder) WriteHeader(status int) {
	if r.wroteHeader {
		return
	}
	r.status = status
	r.wroteHeader = true
	r.ResponseWriter.WriteHeader(status)
}

func (r *statusRecorder) Write(body []byte) (int, error) {
	if !r.wroteHeader {
		r.WriteHeader(http.StatusOK)
	}
	return r.ResponseWriter.Write(body)
}
