package httpapi

import (
	"errors"
	"net/http"

	"github.com/xigemax/sloop/internal/store"
)

const maxBackupBytes = 5 * 1024 * 1024

func (s *Server) handleExportBackup(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.requireAdmin(r.Context(), r); err != nil {
		return err
	}
	exportedAt := s.now().UTC()
	snapshot, err := s.store.ExportBackup(
		r.Context(),
		s.defaultTimezone,
		exportedAt,
	)
	if err != nil {
		return err
	}
	headers := http.Header{}
	headers.Set(
		"Content-Disposition",
		`attachment; filename="sloop-backup-`+
			exportedAt.Format("2006-01-02")+`.json"`,
	)
	writeJSON(w, http.StatusOK, snapshot, headers)
	return nil
}

func (s *Server) handleImportBackup(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.requireAdmin(r.Context(), r); err != nil {
		return err
	}
	raw, err := readJSON(w, r, maxBackupBytes)
	if err != nil {
		var apiError *APIError
		if errors.As(err, &apiError) &&
			apiError.Code == "invalid_json" {
			return &APIError{Status: http.StatusBadRequest, Code: "invalid_backup"}
		}
		return err
	}
	snapshot, err := store.ParseBackup(raw, s.defaultTimezone)
	if err != nil {
		return &APIError{Status: http.StatusBadRequest, Code: "invalid_backup"}
	}
	if err := s.store.ImportBackup(r.Context(), snapshot); err != nil {
		return &APIError{
			Status: http.StatusInternalServerError,
			Code:   "backup_import_failed",
			Cause:  err,
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":              true,
		"imported":        snapshot.Counts,
		"sessionsRevoked": true,
	}, nil)
	return nil
}
