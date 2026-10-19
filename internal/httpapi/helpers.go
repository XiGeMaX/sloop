package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
)

// APIError is an HTTP-visible error with a stable JSON code.
type APIError struct {
	Status int
	Code   string
	Cause  error
}

func (e *APIError) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("%s: %v", e.Code, e.Cause)
	}
	return e.Code
}

func writeJSON(
	w http.ResponseWriter,
	status int,
	value any,
	extraHeaders http.Header,
) {
	for key, values := range extraHeaders {
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeEmpty(w http.ResponseWriter, status int, extraHeaders http.Header) {
	for key, values := range extraHeaders {
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}
	w.WriteHeader(status)
}

func writeAPIError(w http.ResponseWriter, err error, logger *slog.Logger) {
	var apiError *APIError
	if errors.As(err, &apiError) {
		if apiError.Status >= 500 && apiError.Cause != nil {
			logger.Error("api_error", "code", apiError.Code, "error", apiError.Cause)
		}
		writeJSON(w, apiError.Status, map[string]string{"error": apiError.Code}, nil)
		return
	}
	logger.Error("unhandled_api_error", "error", err)
	writeJSON(
		w,
		http.StatusInternalServerError,
		map[string]string{"error": "server_error"},
		nil,
	)
}

func readJSON(
	w http.ResponseWriter,
	r *http.Request,
	maxBytes int64,
) (map[string]any, error) {
	if r.ContentLength > maxBytes {
		return nil, &APIError{Status: http.StatusRequestEntityTooLarge, Code: "request_too_large"}
	}
	reader := http.MaxBytesReader(w, r.Body, maxBytes)
	data, err := io.ReadAll(reader)
	if err != nil {
		var maxBytesError *http.MaxBytesError
		if errors.As(err, &maxBytesError) {
			return nil, &APIError{
				Status: http.StatusRequestEntityTooLarge,
				Code:   "request_too_large",
			}
		}
		return nil, &APIError{Status: http.StatusBadRequest, Code: "invalid_json"}
	}
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, &APIError{Status: http.StatusBadRequest, Code: "invalid_json"}
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return nil, &APIError{Status: http.StatusBadRequest, Code: "invalid_json"}
	}
	object, ok := value.(map[string]any)
	if !ok {
		return nil, &APIError{Status: http.StatusBadRequest, Code: "invalid_json"}
	}
	return object, nil
}

func inputError(err error) error {
	if err == nil {
		return nil
	}
	type statusCoder interface {
		Error() string
	}
	if typed, ok := err.(statusCoder); ok {
		message := typed.Error()
		switch message {
		case "invalid_username", "invalid_password", "invalid_nickname",
			"invalid_invite_code", "invalid_plan", "invalid_cycle",
			"shift_times_match", "invalid_shift_library":
			return &APIError{Status: http.StatusBadRequest, Code: message}
		}
	}
	return err
}

func intFromJSON(value any, fallback int) int {
	switch typed := value.(type) {
	case json.Number:
		number, err := strconv.Atoi(typed.String())
		if err == nil {
			return number
		}
		floatValue, err := strconv.ParseFloat(typed.String(), 64)
		if err == nil {
			return int(floatValue)
		}
	case float64:
		return int(typed)
	case int:
		return typed
	}
	return fallback
}

func stringFromJSON(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case json.Number:
		return typed.String()
	case nil:
		return ""
	default:
		return fmt.Sprint(typed)
	}
}
