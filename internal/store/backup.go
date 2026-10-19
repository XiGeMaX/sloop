package store

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/xigemax/sloop/internal/calendar"
)

const (
	BackupFormat  = "sloop-backup"
	BackupVersion = 1
)

var backupIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,100}$`)

// BackupSnapshot is the portable administrator export format.
type BackupSnapshot struct {
	Format     string       `json:"format"`
	Version    int          `json:"version"`
	ExportedAt string       `json:"exportedAt"`
	Counts     BackupCounts `json:"counts"`
	Data       BackupData   `json:"data"`
}

// BackupCounts reports the row counts included in an export.
type BackupCounts struct {
	Users          int `json:"users"`
	Invites        int `json:"invites"`
	Calendars      int `json:"calendars"`
	ShiftLibraries int `json:"shiftLibraries"`
}

// BackupData contains every row needed to restore an instance.
type BackupData struct {
	Users          []BackupUser         `json:"users"`
	Invites        []BackupInvite       `json:"invites"`
	Calendars      []BackupCalendar     `json:"calendars"`
	ShiftLibraries []BackupShiftLibrary `json:"shiftLibraries"`
}

// BackupUser is one account row in the portable backup.
type BackupUser struct {
	ID           string  `json:"id"`
	Username     string  `json:"username"`
	Nickname     string  `json:"nickname"`
	PasswordHash string  `json:"passwordHash"`
	PasswordSalt string  `json:"passwordSalt"`
	Role         string  `json:"role"`
	Status       string  `json:"status"`
	InviteCode   *string `json:"inviteCode"`
	CreatedAt    string  `json:"createdAt"`
	ApprovedAt   *string `json:"approvedAt"`
	ApprovedBy   *string `json:"approvedBy"`
}

// BackupInvite is one invite row in the portable backup.
type BackupInvite struct {
	ID        string `json:"id"`
	Code      string `json:"code"`
	CreatedBy string `json:"createdBy"`
	MaxUses   int    `json:"maxUses"`
	Uses      int    `json:"uses"`
	ExpiresAt *int64 `json:"expiresAt"`
	Disabled  int    `json:"disabled"`
	CreatedAt string `json:"createdAt"`
}

// BackupCalendar is one saved calendar in the portable backup.
type BackupCalendar struct {
	ID        string         `json:"id"`
	UserID    string         `json:"userId"`
	Title     string         `json:"title"`
	Plan      *calendar.Plan `json:"plan"`
	ShareSlug string         `json:"shareSlug"`
	CreatedAt string         `json:"createdAt"`
	UpdatedAt string         `json:"updatedAt"`
}

// BackupShiftLibrary is one member shift preset collection.
type BackupShiftLibrary struct {
	UserID    string                 `json:"userId"`
	Presets   []calendar.ShiftPreset `json:"presets"`
	UpdatedAt string                 `json:"updatedAt"`
}

// ExportBackup reads a consistent copy of all portable data.
func (s *Store) ExportBackup(
	ctx context.Context,
	defaultTimezone string,
	exportedAt time.Time,
) (BackupSnapshot, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return BackupSnapshot{}, err
	}
	defer tx.Rollback()

	snapshot := BackupSnapshot{
		Format:     BackupFormat,
		Version:    BackupVersion,
		ExportedAt: exportedAt.UTC().Format("2006-01-02T15:04:05.000Z"),
		Data: BackupData{
			Users:          []BackupUser{},
			Invites:        []BackupInvite{},
			Calendars:      []BackupCalendar{},
			ShiftLibraries: []BackupShiftLibrary{},
		},
	}

	userRows, err := tx.QueryContext(
		ctx,
		"SELECT * FROM users ORDER BY created_at, id",
	)
	if err != nil {
		return BackupSnapshot{}, err
	}
	for userRows.Next() {
		user, scanErr := scanUser(userRows)
		if scanErr != nil {
			userRows.Close()
			return BackupSnapshot{}, scanErr
		}
		snapshot.Data.Users = append(snapshot.Data.Users, BackupUser{
			ID:           user.ID,
			Username:     user.Username,
			Nickname:     user.Nickname,
			PasswordHash: user.PasswordHash,
			PasswordSalt: user.PasswordSalt,
			Role:         user.Role,
			Status:       user.Status,
			InviteCode:   user.InviteCode,
			CreatedAt:    user.CreatedAt,
			ApprovedAt:   user.ApprovedAt,
			ApprovedBy:   user.ApprovedBy,
		})
	}
	if err := userRows.Err(); err != nil {
		userRows.Close()
		return BackupSnapshot{}, err
	}
	userRows.Close()

	inviteRows, err := tx.QueryContext(
		ctx,
		"SELECT * FROM invites ORDER BY created_at, id",
	)
	if err != nil {
		return BackupSnapshot{}, err
	}
	for inviteRows.Next() {
		var invite BackupInvite
		var disabled int
		if err := inviteRows.Scan(
			&invite.ID,
			&invite.Code,
			&invite.CreatedBy,
			&invite.MaxUses,
			&invite.Uses,
			&invite.ExpiresAt,
			&disabled,
			&invite.CreatedAt,
		); err != nil {
			inviteRows.Close()
			return BackupSnapshot{}, err
		}
		invite.Disabled = disabled
		snapshot.Data.Invites = append(snapshot.Data.Invites, invite)
	}
	if err := inviteRows.Err(); err != nil {
		inviteRows.Close()
		return BackupSnapshot{}, err
	}
	inviteRows.Close()

	calendarRows, err := tx.QueryContext(
		ctx,
		"SELECT * FROM calendars ORDER BY created_at, id",
	)
	if err != nil {
		return BackupSnapshot{}, err
	}
	for calendarRows.Next() {
		value, scanErr := scanCalendar(calendarRows)
		if scanErr != nil {
			calendarRows.Close()
			return BackupSnapshot{}, scanErr
		}
		plan, planErr := PlanFromJSON(value.PlanJSON, defaultTimezone)
		if planErr != nil {
			plan = calendar.Plan{}
			snapshot.Data.Calendars = append(snapshot.Data.Calendars, BackupCalendar{
				ID:        value.ID,
				UserID:    value.UserID,
				Title:     value.Title,
				Plan:      nil,
				ShareSlug: value.ShareSlug,
				CreatedAt: value.CreatedAt,
				UpdatedAt: value.UpdatedAt,
			})
			continue
		}
		snapshot.Data.Calendars = append(snapshot.Data.Calendars, BackupCalendar{
			ID:        value.ID,
			UserID:    value.UserID,
			Title:     value.Title,
			Plan:      &plan,
			ShareSlug: value.ShareSlug,
			CreatedAt: value.CreatedAt,
			UpdatedAt: value.UpdatedAt,
		})
	}
	if err := calendarRows.Err(); err != nil {
		calendarRows.Close()
		return BackupSnapshot{}, err
	}
	calendarRows.Close()

	libraryRows, err := tx.QueryContext(
		ctx,
		"SELECT user_id, presets_json, updated_at FROM shift_libraries ORDER BY user_id",
	)
	if err != nil {
		return BackupSnapshot{}, err
	}
	for libraryRows.Next() {
		var userID, presetsJSON, updatedAt string
		if err := libraryRows.Scan(&userID, &presetsJSON, &updatedAt); err != nil {
			libraryRows.Close()
			return BackupSnapshot{}, err
		}
		raw, decodeErr := decodeAny([]byte(presetsJSON))
		if decodeErr != nil {
			continue
		}
		presets, normalizeErr := calendar.NormalizeShiftLibrary(raw)
		if normalizeErr != nil {
			continue
		}
		snapshot.Data.ShiftLibraries = append(
			snapshot.Data.ShiftLibraries,
			BackupShiftLibrary{
				UserID:    userID,
				Presets:   presets,
				UpdatedAt: updatedAt,
			},
		)
	}
	if err := libraryRows.Err(); err != nil {
		libraryRows.Close()
		return BackupSnapshot{}, err
	}
	libraryRows.Close()

	snapshot.Counts = BackupCounts{
		Users:          len(snapshot.Data.Users),
		Invites:        len(snapshot.Data.Invites),
		Calendars:      len(snapshot.Data.Calendars),
		ShiftLibraries: len(snapshot.Data.ShiftLibraries),
	}
	if err := tx.Commit(); err != nil {
		return BackupSnapshot{}, err
	}
	return snapshot, nil
}

// ParseBackup validates an uploaded backup completely before any database
// writes occur.
func ParseBackup(raw any, defaultTimezone string) (BackupSnapshot, error) {
	root, ok := raw.(map[string]any)
	if !ok || text(root["format"]) != BackupFormat || number(root["version"], 0) != BackupVersion {
		return BackupSnapshot{}, errors.New("invalid backup")
	}
	data, ok := root["data"].(map[string]any)
	if !ok {
		return BackupSnapshot{}, errors.New("invalid backup")
	}

	sourceUsers, ok := data["users"].([]any)
	if !ok || len(sourceUsers) > 10000 {
		return BackupSnapshot{}, errors.New("invalid backup")
	}
	sourceInvites, ok := data["invites"].([]any)
	if !ok || len(sourceInvites) > 10000 {
		return BackupSnapshot{}, errors.New("invalid backup")
	}
	sourceCalendars, ok := data["calendars"].([]any)
	if !ok || len(sourceCalendars) > 50000 {
		return BackupSnapshot{}, errors.New("invalid backup")
	}
	sourceLibraries := []any{}
	if value, exists := data["shiftLibraries"]; exists {
		sourceLibraries, ok = value.([]any)
		if !ok || len(sourceLibraries) > 10000 {
			return BackupSnapshot{}, errors.New("invalid backup")
		}
	}

	snapshot := BackupSnapshot{
		Format:     BackupFormat,
		Version:    BackupVersion,
		ExportedAt: text(root["exportedAt"]),
		Data: BackupData{
			Users:          make([]BackupUser, 0, len(sourceUsers)),
			Invites:        make([]BackupInvite, 0, len(sourceInvites)),
			Calendars:      make([]BackupCalendar, 0, len(sourceCalendars)),
			ShiftLibraries: make([]BackupShiftLibrary, 0, len(sourceLibraries)),
		},
	}

	for _, source := range sourceUsers {
		user, err := normalizeBackupUser(source)
		if err != nil {
			return BackupSnapshot{}, err
		}
		snapshot.Data.Users = append(snapshot.Data.Users, user)
	}
	for _, source := range sourceInvites {
		invite, err := normalizeBackupInvite(source)
		if err != nil {
			return BackupSnapshot{}, err
		}
		snapshot.Data.Invites = append(snapshot.Data.Invites, invite)
	}
	for _, source := range sourceCalendars {
		value, err := normalizeBackupCalendar(source, defaultTimezone)
		if err != nil {
			return BackupSnapshot{}, err
		}
		snapshot.Data.Calendars = append(snapshot.Data.Calendars, value)
	}
	for _, source := range sourceLibraries {
		value, err := normalizeBackupLibrary(source)
		if err != nil {
			return BackupSnapshot{}, err
		}
		snapshot.Data.ShiftLibraries = append(snapshot.Data.ShiftLibraries, value)
	}

	if err := validateBackup(snapshot.Data); err != nil {
		return BackupSnapshot{}, err
	}
	snapshot.Counts = BackupCounts{
		Users:          len(snapshot.Data.Users),
		Invites:        len(snapshot.Data.Invites),
		Calendars:      len(snapshot.Data.Calendars),
		ShiftLibraries: len(snapshot.Data.ShiftLibraries),
	}
	return snapshot, nil
}

// ImportBackup replaces all portable data in one transaction and revokes every
// existing session.
func (s *Store) ImportBackup(ctx context.Context, snapshot BackupSnapshot) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, statement := range []string{
		"DELETE FROM sessions",
		"DELETE FROM calendars",
		"DELETE FROM shift_libraries",
		"DELETE FROM invites",
		"DELETE FROM users",
	} {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return err
		}
	}

	for _, user := range snapshot.Data.Users {
		if _, err := tx.ExecContext(
			ctx,
			`INSERT INTO users
			 (id, username, nickname, password_hash, password_salt, role, status,
			  invite_code, created_at, approved_at, approved_by)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			user.ID,
			user.Username,
			user.Nickname,
			user.PasswordHash,
			user.PasswordSalt,
			user.Role,
			user.Status,
			user.InviteCode,
			user.CreatedAt,
			user.ApprovedAt,
			user.ApprovedBy,
		); err != nil {
			return err
		}
	}
	for _, library := range snapshot.Data.ShiftLibraries {
		presetsJSON, err := json.Marshal(library.Presets)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(
			ctx,
			`INSERT INTO shift_libraries (user_id, presets_json, updated_at)
			 VALUES (?, ?, ?)`,
			library.UserID,
			string(presetsJSON),
			library.UpdatedAt,
		); err != nil {
			return err
		}
	}
	for _, invite := range snapshot.Data.Invites {
		if _, err := tx.ExecContext(
			ctx,
			`INSERT INTO invites
			 (id, code, created_by, max_uses, uses, expires_at, disabled, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			invite.ID,
			invite.Code,
			invite.CreatedBy,
			invite.MaxUses,
			invite.Uses,
			invite.ExpiresAt,
			invite.Disabled,
			invite.CreatedAt,
		); err != nil {
			return err
		}
	}
	for _, value := range snapshot.Data.Calendars {
		if value.Plan == nil {
			return errors.New("invalid backup")
		}
		planJSON, err := json.Marshal(value.Plan)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(
			ctx,
			`INSERT INTO calendars
			 (id, user_id, title, plan_json, share_slug, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			value.ID,
			value.UserID,
			value.Title,
			string(planJSON),
			value.ShareSlug,
			value.CreatedAt,
			value.UpdatedAt,
		); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return nil
}

func normalizeBackupUser(source any) (BackupUser, error) {
	object, ok := source.(map[string]any)
	if !ok {
		return BackupUser{}, errors.New("invalid backup")
	}
	username, err := calendar.NormalizeUsername(object["username"])
	if err != nil {
		return BackupUser{}, errors.New("invalid backup")
	}
	nickname, err := calendar.NormalizeNickname(object["nickname"])
	if err != nil {
		return BackupUser{}, errors.New("invalid backup")
	}
	role := text(object["role"])
	status := text(object["status"])
	if !oneOf(role, "admin", "user") ||
		!oneOf(status, "pending", "approved", "rejected", "disabled") {
		return BackupUser{}, errors.New("invalid backup")
	}
	passwordHash, err := normalizeBackupPassword(object["passwordHash"], 32)
	if err != nil {
		return BackupUser{}, err
	}
	passwordSalt, err := normalizeBackupPassword(object["passwordSalt"], 16)
	if err != nil {
		return BackupUser{}, err
	}
	createdAtValue, err := normalizeBackupTimestamp(object["createdAt"], false)
	if err != nil {
		return BackupUser{}, err
	}
	approvedAt, err := normalizeBackupTimestamp(object["approvedAt"], true)
	if err != nil {
		return BackupUser{}, err
	}
	var approvedBy *string
	if value := text(object["approvedBy"]); value != "" {
		id, err := normalizeBackupID(value)
		if err != nil {
			return BackupUser{}, err
		}
		approvedBy = &id
	}
	var inviteCode *string
	if value := cleanBackupText(object["inviteCode"], 32); value != "" {
		inviteCode = &value
	}
	id, err := normalizeBackupID(object["id"])
	if err != nil {
		return BackupUser{}, err
	}
	return BackupUser{
		ID:           id,
		Username:     username,
		Nickname:     nickname,
		PasswordHash: passwordHash,
		PasswordSalt: passwordSalt,
		Role:         role,
		Status:       status,
		InviteCode:   inviteCode,
		CreatedAt:    *createdAtValue,
		ApprovedAt:   approvedAt,
		ApprovedBy:   approvedBy,
	}, nil
}

func normalizeBackupInvite(source any) (BackupInvite, error) {
	object, ok := source.(map[string]any)
	if !ok {
		return BackupInvite{}, errors.New("invalid backup")
	}
	code, err := calendar.NormalizeInviteCode(cleanBackupText(object["code"], 32))
	if err != nil || code == "" {
		return BackupInvite{}, errors.New("invalid backup")
	}
	maxUses, ok := normalizeBackupInteger(object["maxUses"], 1, 100, false)
	if !ok {
		return BackupInvite{}, errors.New("invalid backup")
	}
	uses, ok := normalizeBackupInteger(object["uses"], 0, maxUses, false)
	if !ok {
		return BackupInvite{}, errors.New("invalid backup")
	}
	expiresAt, ok := normalizeBackupInteger64(object["expiresAt"], 0, 9999999999, true)
	if !ok {
		return BackupInvite{}, errors.New("invalid backup")
	}
	disabled, err := normalizeBackupFlag(object["disabled"])
	if err != nil {
		return BackupInvite{}, err
	}
	createdAtValue, err := normalizeBackupTimestamp(object["createdAt"], false)
	if err != nil {
		return BackupInvite{}, err
	}
	id, err := normalizeBackupID(object["id"])
	if err != nil {
		return BackupInvite{}, err
	}
	createdBy, err := normalizeBackupID(object["createdBy"])
	if err != nil {
		return BackupInvite{}, err
	}
	return BackupInvite{
		ID:        id,
		Code:      code,
		CreatedBy: createdBy,
		MaxUses:   int(maxUses),
		Uses:      int(uses),
		ExpiresAt: expiresAt,
		Disabled:  disabled,
		CreatedAt: *createdAtValue,
	}, nil
}

func normalizeBackupCalendar(source any, defaultTimezone string) (BackupCalendar, error) {
	object, ok := source.(map[string]any)
	if !ok {
		return BackupCalendar{}, errors.New("invalid backup")
	}
	plan, err := calendar.NormalizePlan(object["plan"], defaultTimezone)
	if err != nil {
		return BackupCalendar{}, errors.New("invalid backup")
	}
	title := cleanBackupText(object["title"], 64)
	if title == "" {
		title = plan.Title
	}
	plan.Title = title
	createdAtValue, err := normalizeBackupTimestamp(object["createdAt"], false)
	if err != nil {
		return BackupCalendar{}, err
	}
	updatedAtValue, err := normalizeBackupTimestamp(object["updatedAt"], false)
	if err != nil {
		return BackupCalendar{}, err
	}
	id, err := normalizeBackupID(object["id"])
	if err != nil {
		return BackupCalendar{}, err
	}
	userID, err := normalizeBackupID(object["userId"])
	if err != nil {
		return BackupCalendar{}, err
	}
	shareSlug, err := normalizeBackupID(object["shareSlug"])
	if err != nil {
		return BackupCalendar{}, err
	}
	return BackupCalendar{
		ID:        id,
		UserID:    userID,
		Title:     title,
		Plan:      &plan,
		ShareSlug: shareSlug,
		CreatedAt: *createdAtValue,
		UpdatedAt: *updatedAtValue,
	}, nil
}

func normalizeBackupLibrary(source any) (BackupShiftLibrary, error) {
	object, ok := source.(map[string]any)
	if !ok {
		return BackupShiftLibrary{}, errors.New("invalid backup")
	}
	presets, err := calendar.NormalizeShiftLibrary(object["presets"])
	if err != nil {
		return BackupShiftLibrary{}, errors.New("invalid backup")
	}
	updatedAtValue, err := normalizeBackupTimestamp(object["updatedAt"], false)
	if err != nil {
		return BackupShiftLibrary{}, err
	}
	userID, err := normalizeBackupID(object["userId"])
	if err != nil {
		return BackupShiftLibrary{}, err
	}
	return BackupShiftLibrary{
		UserID:    userID,
		Presets:   presets,
		UpdatedAt: *updatedAtValue,
	}, nil
}

func validateBackup(data BackupData) error {
	userIDs := map[string]struct{}{}
	usernames := map[string]struct{}{}
	adminExists := false
	for _, user := range data.Users {
		if _, exists := userIDs[user.ID]; exists {
			return errors.New("invalid backup")
		}
		userIDs[user.ID] = struct{}{}
		if _, exists := usernames[user.Username]; exists {
			return errors.New("invalid backup")
		}
		usernames[user.Username] = struct{}{}
		if user.Role == "admin" && user.Status == "approved" {
			adminExists = true
		}
	}
	if !adminExists {
		return errors.New("invalid backup")
	}

	inviteIDs := map[string]struct{}{}
	inviteCodes := map[string]struct{}{}
	for _, invite := range data.Invites {
		if _, exists := inviteIDs[invite.ID]; exists {
			return errors.New("invalid backup")
		}
		if _, exists := inviteCodes[invite.Code]; exists {
			return errors.New("invalid backup")
		}
		if _, exists := userIDs[invite.CreatedBy]; !exists {
			return errors.New("invalid backup")
		}
		inviteIDs[invite.ID] = struct{}{}
		inviteCodes[invite.Code] = struct{}{}
	}

	calendarIDs := map[string]struct{}{}
	calendarSlugs := map[string]struct{}{}
	for _, value := range data.Calendars {
		if value.Plan == nil {
			return errors.New("invalid backup")
		}
		if _, exists := calendarIDs[value.ID]; exists {
			return errors.New("invalid backup")
		}
		if _, exists := calendarSlugs[value.ShareSlug]; exists {
			return errors.New("invalid backup")
		}
		if _, exists := userIDs[value.UserID]; !exists {
			return errors.New("invalid backup")
		}
		calendarIDs[value.ID] = struct{}{}
		calendarSlugs[value.ShareSlug] = struct{}{}
	}

	libraryUsers := map[string]struct{}{}
	for _, library := range data.ShiftLibraries {
		if _, exists := userIDs[library.UserID]; !exists {
			return errors.New("invalid backup")
		}
		if _, exists := libraryUsers[library.UserID]; exists {
			return errors.New("invalid backup")
		}
		libraryUsers[library.UserID] = struct{}{}
	}
	return nil
}

func normalizeBackupID(value any) (string, error) {
	id := strings.TrimSpace(text(value))
	if !backupIDPattern.MatchString(id) {
		return "", errors.New("invalid backup")
	}
	return id, nil
}

func normalizeBackupTimestamp(value any, nullable bool) (*string, error) {
	raw := text(value)
	if raw == "" {
		if nullable {
			return nil, nil
		}
		return nil, errors.New("invalid backup")
	}
	timestamp, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil {
		return nil, errors.New("invalid backup")
	}
	formatted := timestamp.UTC().Format("2006-01-02T15:04:05.000Z")
	return &formatted, nil
}

func normalizeBackupPassword(value any, expectedBytes int) (string, error) {
	encoded := text(value)
	if encoded == "" {
		return "", errors.New("invalid backup")
	}
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(decoded) != expectedBytes {
		return "", errors.New("invalid backup")
	}
	return encoded, nil
}

func normalizeBackupInteger(value any, minimum, maximum int64, nullable bool) (int64, bool) {
	if nullable && (value == nil || text(value) == "") {
		return 0, true
	}
	number, ok := integer64(value)
	if !ok || number < minimum || number > maximum {
		return 0, false
	}
	return number, true
}

func normalizeBackupInteger64(
	value any,
	minimum, maximum int64,
	nullable bool,
) (*int64, bool) {
	if nullable && (value == nil || text(value) == "") {
		return nil, true
	}
	number, ok := integer64(value)
	if !ok || number < minimum || number > maximum {
		return nil, false
	}
	return &number, true
}

func normalizeBackupFlag(value any) (int, error) {
	switch typed := value.(type) {
	case bool:
		if typed {
			return 1, nil
		}
		return 0, nil
	case json.Number:
		number, err := typed.Int64()
		if err == nil && (number == 0 || number == 1) {
			return int(number), nil
		}
	case string:
		if typed == "0" || typed == "1" {
			number, _ := strconv.Atoi(typed)
			return number, nil
		}
	case float64:
		if typed == 0 || typed == 1 {
			return int(typed), nil
		}
	}
	return 0, errors.New("invalid backup")
}

func integer64(value any) (int64, bool) {
	switch typed := value.(type) {
	case json.Number:
		number, err := typed.Int64()
		return number, err == nil
	case float64:
		if typed != float64(int64(typed)) {
			return 0, false
		}
		return int64(typed), true
	case string:
		number, err := strconv.ParseInt(strings.TrimSpace(typed), 10, 64)
		return number, err == nil
	case int:
		return int64(typed), true
	case int64:
		return typed, true
	default:
		return 0, false
	}
}

func number(value any, fallback int64) int64 {
	result, ok := integer64(value)
	if !ok {
		return fallback
	}
	return result
}

func text(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return typed
	case json.Number:
		return typed.String()
	default:
		return strings.TrimSpace(strings.Trim(valueString(typed), `"`))
	}
}

func valueString(value any) string {
	data, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(data)
}

func cleanBackupText(value any, maximum int) string {
	textValue := strings.Join(strings.Fields(strings.NewReplacer(
		"\r", " ",
		"\n", " ",
		"\t", " ",
	).Replace(text(value))), " ")
	runes := []rune(textValue)
	if len(runes) > maximum {
		runes = runes[:maximum]
	}
	return strings.TrimSpace(string(runes))
}

func oneOf(value string, allowed ...string) bool {
	for _, candidate := range allowed {
		if value == candidate {
			return true
		}
	}
	return false
}
