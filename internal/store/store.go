// Package store provides SQLite persistence for Sloop.
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/sqlite"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	_ "modernc.org/sqlite"

	"github.com/xigemax/sloop/internal/calendar"
	"github.com/xigemax/sloop/migrations"
)

var (
	ErrNotFound         = errors.New("not found")
	ErrUsernameExists   = errors.New("username exists")
	ErrInvalidInvite    = errors.New("invalid invite")
	ErrLastAdmin        = errors.New("last admin")
	ErrCannotModifySelf = errors.New("cannot modify self")
	ErrCannotResetSelf  = errors.New("cannot reset self")
	ErrCalendarLimit    = errors.New("calendar limit")
	ErrInviteExists     = errors.New("invite exists")
)

// User is a persisted account row.
type User struct {
	ID           string
	Username     string
	Nickname     string
	PasswordHash string
	PasswordSalt string
	Role         string
	Status       string
	InviteCode   *string
	CreatedAt    string
	ApprovedAt   *string
	ApprovedBy   *string
	Locale       string
}

// Calendar is a member-owned saved shift plan.
type Calendar struct {
	ID        string
	UserID    string
	Title     string
	PlanJSON  string
	ShareSlug string
	CreatedAt string
	UpdatedAt string
}

// Invite is an account registration invite.
type Invite struct {
	ID          string
	Code        string
	CreatedBy   string
	MaxUses     int
	Uses        int
	ExpiresAt   *int64
	Disabled    bool
	CreatorName string
	CreatedAt   string
}

// UserWithCount is an admin user-list row.
type UserWithCount struct {
	User
	CalendarCount int
}

// Registration contains all values needed for an atomic account creation.
type Registration struct {
	ID               string
	Username         string
	Nickname         string
	PasswordHash     string
	PasswordSalt     string
	Locale           string
	InviteCode       string
	CreatedAt        string
	RegisteredAtUnix int64
	SessionTokenHash string
	SessionExpiresAt int64
}

// RegistrationResult explains whether the account is approved and why.
type RegistrationResult struct {
	User      User
	Bootstrap bool
}

// Store wraps the SQLite handle used by the HTTP and administration layers.
type Store struct {
	db *sql.DB
}

// Open creates the database directory, opens SQLite, and applies migrations.
func Open(ctx context.Context, path string) (*Store, error) {
	if path == "" {
		return nil, errors.New("database path is required")
	}
	absolutePath, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("resolving database path: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(absolutePath), 0o750); err != nil {
		return nil, fmt.Errorf("creating database directory: %w", err)
	}
	databaseFile, err := os.OpenFile(
		absolutePath,
		os.O_RDWR|os.O_CREATE,
		0o600,
	)
	if err != nil {
		return nil, fmt.Errorf("creating database file: %w", err)
	}
	if err := databaseFile.Close(); err != nil {
		return nil, fmt.Errorf("closing database file: %w", err)
	}

	fileURL := &url.URL{Scheme: "file", Path: absolutePath}
	query := fileURL.Query()
	query.Add("_pragma", "busy_timeout(5000)")
	query.Add("_pragma", "journal_mode(WAL)")
	query.Add("_pragma", "foreign_keys(ON)")
	query.Add("_pragma", "synchronous(NORMAL)")
	query.Set("_txlock", "immediate")
	fileURL.RawQuery = query.Encode()

	db, err := sql.Open("sqlite", fileURL.String())
	if err != nil {
		return nil, fmt.Errorf("opening sqlite: %w", err)
	}
	// A single connection avoids SQLITE_BUSY surprises for this small,
	// self-hosted workload while WAL still keeps startup and shutdown safe.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	db.SetConnMaxIdleTime(5 * time.Minute)

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("pinging sqlite: %w", err)
	}
	if err := Migrate(ctx, db); err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

// New wraps an already configured SQLite handle. Callers that use New are
// responsible for running Migrate before serving requests.
func New(db *sql.DB) *Store {
	return &Store{db: db}
}

// Close releases the SQLite connection.
func (s *Store) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

// Ping verifies that SQLite is reachable.
func (s *Store) Ping(ctx context.Context) error {
	return s.db.PingContext(ctx)
}

// Migrate applies every embedded schema migration.
func Migrate(ctx context.Context, db *sql.DB) error {
	driver, err := sqlite.WithInstance(db, &sqlite.Config{})
	if err != nil {
		return fmt.Errorf("creating sqlite migration driver: %w", err)
	}
	source, err := iofs.New(migrations.Files, ".")
	if err != nil {
		return fmt.Errorf("loading embedded migrations: %w", err)
	}
	defer source.Close()

	instance, err := migrate.NewWithInstance("iofs", source, "sqlite", driver)
	if err != nil {
		return fmt.Errorf("creating migrator: %w", err)
	}
	if err := instance.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("applying migrations: %w", err)
	}
	return nil
}

// Register creates the first administrator or a member account in one
// transaction, consuming an invite atomically when one is provided.
func (s *Store) Register(
	ctx context.Context,
	registration Registration,
) (RegistrationResult, error) {
	if registration.RegisteredAtUnix <= 0 {
		return RegistrationResult{}, errors.New("registration timestamp is required")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return RegistrationResult{}, fmt.Errorf("beginning registration: %w", err)
	}
	defer tx.Rollback()

	var existing string
	err = tx.QueryRowContext(
		ctx,
		"SELECT id FROM users WHERE username = ? LIMIT 1",
		registration.Username,
	).Scan(&existing)
	if err == nil {
		return RegistrationResult{}, ErrUsernameExists
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return RegistrationResult{}, fmt.Errorf("checking username: %w", err)
	}

	var count int
	if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&count); err != nil {
		return RegistrationResult{}, fmt.Errorf("counting users: %w", err)
	}
	bootstrap := count == 0

	var inviteID string
	if registration.InviteCode != "" {
		err := tx.QueryRowContext(
			ctx,
			`SELECT id
			 FROM invites
			 WHERE code = ? AND disabled = 0 AND uses < max_uses
			   AND (expires_at IS NULL OR expires_at > ?)
			 LIMIT 1`,
			registration.InviteCode,
			registration.RegisteredAtUnix,
		).Scan(&inviteID)
		if errors.Is(err, sql.ErrNoRows) {
			return RegistrationResult{}, ErrInvalidInvite
		}
		if err != nil {
			return RegistrationResult{}, fmt.Errorf("validating invite: %w", err)
		}
	}

	approved := bootstrap || inviteID != ""
	role := "user"
	status := "pending"
	var approvedAt any
	var approvedBy any
	if bootstrap {
		role = "admin"
	}
	if approved {
		status = "approved"
		approvedAt = registration.CreatedAt
		approvedBy = registration.ID
	}

	_, err = tx.ExecContext(
		ctx,
		`INSERT INTO users
		 (id, username, nickname, password_hash, password_salt, role, status,
		  invite_code, created_at, approved_at, approved_by, locale)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		registration.ID,
		registration.Username,
		registration.Nickname,
		registration.PasswordHash,
		registration.PasswordSalt,
		role,
		status,
		nullableString(registration.InviteCode),
		registration.CreatedAt,
		approvedAt,
		approvedBy,
		registration.Locale,
	)
	if err != nil {
		if isUniqueConstraint(err) {
			return RegistrationResult{}, ErrUsernameExists
		}
		return RegistrationResult{}, fmt.Errorf("inserting user: %w", err)
	}

	if inviteID != "" {
		if _, err := tx.ExecContext(
			ctx,
			"UPDATE invites SET uses = uses + 1 WHERE id = ?",
			inviteID,
		); err != nil {
			return RegistrationResult{}, fmt.Errorf("consuming invite: %w", err)
		}
	}

	if approved {
		if _, err := tx.ExecContext(
			ctx,
			`INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
			 VALUES (?, ?, ?, ?)`,
			registration.SessionTokenHash,
			registration.ID,
			registration.CreatedAt,
			registration.SessionExpiresAt,
		); err != nil {
			return RegistrationResult{}, fmt.Errorf("creating registration session: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return RegistrationResult{}, fmt.Errorf("committing registration: %w", err)
	}

	user := User{
		ID:           registration.ID,
		Username:     registration.Username,
		Nickname:     registration.Nickname,
		PasswordHash: registration.PasswordHash,
		PasswordSalt: registration.PasswordSalt,
		Role:         role,
		Status:       status,
		CreatedAt:    registration.CreatedAt,
		Locale:       registration.Locale,
	}
	if registration.InviteCode != "" {
		user.InviteCode = &registration.InviteCode
	}
	if approved {
		user.ApprovedAt = &registration.CreatedAt
		user.ApprovedBy = &registration.ID
	}
	return RegistrationResult{User: user, Bootstrap: bootstrap}, nil
}

// FindUserByUsername returns a matching account even when it is not approved.
func (s *Store) FindUserByUsername(ctx context.Context, username string) (User, error) {
	return scanUser(s.db.QueryRowContext(
		ctx,
		"SELECT * FROM users WHERE username = ? LIMIT 1",
		username,
	))
}

// FindUserByID returns one account by ID.
func (s *Store) FindUserByID(ctx context.Context, id string) (User, error) {
	return scanUser(s.db.QueryRowContext(
		ctx,
		"SELECT * FROM users WHERE id = ? LIMIT 1",
		id,
	))
}

// CreateSession stores a hashed session token.
func (s *Store) CreateSession(
	ctx context.Context,
	tokenHash, userID, createdAt string,
	expiresAt int64,
) error {
	_, err := s.db.ExecContext(
		ctx,
		`INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
		 VALUES (?, ?, ?, ?)`,
		tokenHash,
		userID,
		createdAt,
		expiresAt,
	)
	if err != nil {
		return fmt.Errorf("creating session: %w", err)
	}
	return nil
}

// FindSessionUser resolves an approved account from a session token hash.
func (s *Store) FindSessionUser(
	ctx context.Context,
	tokenHash string,
	nowUnix int64,
) (User, error) {
	return scanUser(s.db.QueryRowContext(
		ctx,
		`SELECT u.*
		 FROM sessions s
		 JOIN users u ON u.id = s.user_id
		 WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'approved'
		 LIMIT 1`,
		tokenHash,
		nowUnix,
	))
}

// DeleteSession removes one session token.
func (s *Store) DeleteSession(ctx context.Context, tokenHash string) error {
	if _, err := s.db.ExecContext(
		ctx,
		"DELETE FROM sessions WHERE token_hash = ?",
		tokenHash,
	); err != nil {
		return fmt.Errorf("deleting session: %w", err)
	}
	return nil
}

// DeleteOtherSessions keeps the current session and revokes the rest.
func (s *Store) DeleteOtherSessions(
	ctx context.Context,
	userID, currentTokenHash string,
) error {
	if _, err := s.db.ExecContext(
		ctx,
		"DELETE FROM sessions WHERE user_id = ? AND token_hash != ?",
		userID,
		currentTokenHash,
	); err != nil {
		return fmt.Errorf("deleting other sessions: %w", err)
	}
	return nil
}

// UpdateProfile changes a member's username and nickname.
func (s *Store) UpdateProfile(
	ctx context.Context,
	userID, username, nickname string,
) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("beginning profile update: %w", err)
	}
	defer tx.Rollback()

	var existing string
	err = tx.QueryRowContext(
		ctx,
		"SELECT id FROM users WHERE username = ? AND id != ? LIMIT 1",
		username,
		userID,
	).Scan(&existing)
	if err == nil {
		return ErrUsernameExists
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("checking username: %w", err)
	}
	if _, err := tx.ExecContext(
		ctx,
		"UPDATE users SET username = ?, nickname = ? WHERE id = ?",
		username,
		nickname,
		userID,
	); err != nil {
		if isUniqueConstraint(err) {
			return ErrUsernameExists
		}
		return fmt.Errorf("updating profile: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("committing profile update: %w", err)
	}
	return nil
}

// UpdatePassword stores a new password hash.
func (s *Store) UpdatePassword(
	ctx context.Context,
	userID, passwordHash, passwordSalt string,
) error {
	if _, err := s.db.ExecContext(
		ctx,
		"UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?",
		passwordHash,
		passwordSalt,
		userID,
	); err != nil {
		return fmt.Errorf("updating password: %w", err)
	}
	return nil
}

// UpdateLocale stores a member's preferred interface locale. An empty locale
// means the browser preference should be used.
func (s *Store) UpdateLocale(ctx context.Context, userID, locale string) error {
	result, err := s.db.ExecContext(
		ctx,
		"UPDATE users SET locale = ? WHERE id = ?",
		locale,
		userID,
	)
	if err != nil {
		return fmt.Errorf("updating locale: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("checking locale update: %w", err)
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

// ChangePassword stores a new password and revokes every other session for the
// same account in one transaction.
func (s *Store) ChangePassword(
	ctx context.Context,
	userID, passwordHash, passwordSalt, currentTokenHash string,
) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("beginning password change: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(
		ctx,
		"UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?",
		passwordHash,
		passwordSalt,
		userID,
	); err != nil {
		return fmt.Errorf("updating password: %w", err)
	}
	if _, err := tx.ExecContext(
		ctx,
		"DELETE FROM sessions WHERE user_id = ? AND token_hash != ?",
		userID,
		currentTokenHash,
	); err != nil {
		return fmt.Errorf("deleting other sessions: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("committing password change: %w", err)
	}
	return nil
}

// GetShiftLibrary returns one user's serialized shift presets.
func (s *Store) GetShiftLibrary(
	ctx context.Context,
	userID string,
) (string, string, error) {
	var presetsJSON, updatedAt string
	err := s.db.QueryRowContext(
		ctx,
		"SELECT presets_json, updated_at FROM shift_libraries WHERE user_id = ? LIMIT 1",
		userID,
	).Scan(&presetsJSON, &updatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return "", "", ErrNotFound
	}
	if err != nil {
		return "", "", fmt.Errorf("querying shift library: %w", err)
	}
	return presetsJSON, updatedAt, nil
}

// SaveShiftLibrary inserts or replaces one user's shift presets.
func (s *Store) SaveShiftLibrary(
	ctx context.Context,
	userID, presetsJSON, updatedAt string,
) error {
	_, err := s.db.ExecContext(
		ctx,
		`INSERT INTO shift_libraries (user_id, presets_json, updated_at)
		 VALUES (?, ?, ?)
		 ON CONFLICT(user_id) DO UPDATE SET
		   presets_json = excluded.presets_json,
		   updated_at = excluded.updated_at`,
		userID,
		presetsJSON,
		updatedAt,
	)
	if err != nil {
		return fmt.Errorf("saving shift library: %w", err)
	}
	return nil
}

// ListUsers returns all accounts ordered for admin review.
func (s *Store) ListUsers(ctx context.Context) ([]UserWithCount, error) {
	rows, err := s.db.QueryContext(
		ctx,
		`SELECT u.id, u.username, u.nickname, u.password_hash, u.password_salt,
		        u.role, u.status, u.invite_code, u.created_at, u.approved_at,
		        u.approved_by, u.locale, COUNT(c.id) AS calendar_count
		 FROM users u
		 LEFT JOIN calendars c ON c.user_id = u.id
		 GROUP BY u.id
		 ORDER BY CASE u.status WHEN 'pending' THEN 0 ELSE 1 END,
		          u.created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("querying users: %w", err)
	}
	defer rows.Close()

	var users []UserWithCount
	for rows.Next() {
		var user UserWithCount
		var inviteCode, approvedAt, approvedBy sql.NullString
		if err := rows.Scan(
			&user.ID,
			&user.Username,
			&user.Nickname,
			&user.PasswordHash,
			&user.PasswordSalt,
			&user.Role,
			&user.Status,
			&inviteCode,
			&user.CreatedAt,
			&approvedAt,
			&approvedBy,
			&user.Locale,
			&user.CalendarCount,
		); err != nil {
			return nil, fmt.Errorf("scanning user: %w", err)
		}
		user.InviteCode = nullStringPointer(inviteCode)
		user.ApprovedAt = nullStringPointer(approvedAt)
		user.ApprovedBy = nullStringPointer(approvedBy)
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating users: %w", err)
	}
	return users, nil
}

// UpdateUser changes an account's role and status while preserving the last
// approved administrator.
func (s *Store) UpdateUser(
	ctx context.Context,
	adminID, targetID, status, role, now string,
) (User, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return User{}, fmt.Errorf("beginning user update: %w", err)
	}
	defer tx.Rollback()

	target, err := scanUser(tx.QueryRowContext(
		ctx,
		"SELECT * FROM users WHERE id = ? LIMIT 1",
		targetID,
	))
	if err != nil {
		return User{}, err
	}
	if target.ID == adminID && status == "approved" && role == target.Role {
		// No-op self update is allowed.
	} else if target.ID == adminID {
		return User{}, ErrCannotModifySelf
	}

	if target.Role == "admin" && target.Status == "approved" &&
		(role != "admin" || status != "approved") {
		var adminCount int
		if err := tx.QueryRowContext(
			ctx,
			"SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'approved'",
		).Scan(&adminCount); err != nil {
			return User{}, fmt.Errorf("counting administrators: %w", err)
		}
		if adminCount <= 1 {
			return User{}, ErrLastAdmin
		}
	}

	_, err = tx.ExecContext(
		ctx,
		`UPDATE users
		 SET status = ?, role = ?,
		     approved_at = CASE WHEN ? = 'approved'
		       THEN COALESCE(approved_at, ?) ELSE approved_at END,
		     approved_by = CASE WHEN ? = 'approved'
		       THEN COALESCE(approved_by, ?) ELSE approved_by END
		 WHERE id = ?`,
		status,
		role,
		status,
		now,
		status,
		adminID,
		targetID,
	)
	if err != nil {
		return User{}, fmt.Errorf("updating user: %w", err)
	}
	if status != "approved" {
		if _, err := tx.ExecContext(
			ctx,
			"DELETE FROM sessions WHERE user_id = ?",
			targetID,
		); err != nil {
			return User{}, fmt.Errorf("revoking user sessions: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return User{}, fmt.Errorf("committing user update: %w", err)
	}

	target.Status = status
	target.Role = role
	if status == "approved" {
		if target.ApprovedAt == nil {
			target.ApprovedAt = &now
		}
		if target.ApprovedBy == nil {
			target.ApprovedBy = &adminID
		}
	}
	return target, nil
}

// DeleteUser permanently removes an account and its owned data. The caller
// cannot delete itself, and the final approved administrator is protected.
func (s *Store) DeleteUser(ctx context.Context, adminID, targetID string) error {
	if adminID == targetID {
		return ErrCannotModifySelf
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("beginning user deletion: %w", err)
	}
	defer tx.Rollback()

	target, err := scanUser(tx.QueryRowContext(
		ctx,
		"SELECT * FROM users WHERE id = ? LIMIT 1",
		targetID,
	))
	if err != nil {
		return err
	}
	if target.Role == "admin" && target.Status == "approved" {
		var adminCount int
		if err := tx.QueryRowContext(
			ctx,
			"SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'approved'",
		).Scan(&adminCount); err != nil {
			return fmt.Errorf("counting administrators: %w", err)
		}
		if adminCount <= 1 {
			return ErrLastAdmin
		}
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM users WHERE id = ?", targetID); err != nil {
		return fmt.Errorf("deleting user: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("committing user deletion: %w", err)
	}
	return nil
}

// ResetPassword changes another account's password and revokes all sessions.
func (s *Store) ResetPassword(
	ctx context.Context,
	adminID, targetID, passwordHash, passwordSalt string,
) error {
	if adminID == targetID {
		return ErrCannotResetSelf
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("beginning password reset: %w", err)
	}
	defer tx.Rollback()

	result, err := tx.ExecContext(
		ctx,
		"UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?",
		passwordHash,
		passwordSalt,
		targetID,
	)
	if err != nil {
		return fmt.Errorf("resetting password: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("checking password reset: %w", err)
	}
	if affected == 0 {
		return ErrNotFound
	}
	if _, err := tx.ExecContext(
		ctx,
		"DELETE FROM sessions WHERE user_id = ?",
		targetID,
	); err != nil {
		return fmt.Errorf("revoking target sessions: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("committing password reset: %w", err)
	}
	return nil
}

// ListInvites returns every invite and its creator.
func (s *Store) ListInvites(ctx context.Context) ([]Invite, error) {
	rows, err := s.db.QueryContext(
		ctx,
		`SELECT i.*, u.nickname AS creator_name
		 FROM invites i
		 JOIN users u ON u.id = i.created_by
		 ORDER BY i.created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("querying invites: %w", err)
	}
	defer rows.Close()

	var invites []Invite
	for rows.Next() {
		var invite Invite
		var expiresAt sql.NullInt64
		var disabled int
		if err := rows.Scan(
			&invite.ID,
			&invite.Code,
			&invite.CreatedBy,
			&invite.MaxUses,
			&invite.Uses,
			&expiresAt,
			&disabled,
			&invite.CreatedAt,
			&invite.CreatorName,
		); err != nil {
			return nil, fmt.Errorf("scanning invite: %w", err)
		}
		if expiresAt.Valid {
			value := expiresAt.Int64
			invite.ExpiresAt = &value
		}
		invite.Disabled = disabled != 0
		invites = append(invites, invite)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating invites: %w", err)
	}
	return invites, nil
}

// CreateInvite inserts an invite and returns the persisted view.
func (s *Store) CreateInvite(
	ctx context.Context,
	id, code, adminID, creatorName string,
	maxUses int,
	expiresAt *int64,
	createdAt string,
) (Invite, error) {
	var existing string
	err := s.db.QueryRowContext(
		ctx,
		"SELECT id FROM invites WHERE code = ? LIMIT 1",
		code,
	).Scan(&existing)
	if err == nil {
		return Invite{}, ErrInviteExists
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return Invite{}, fmt.Errorf("checking invite code: %w", err)
	}

	_, err = s.db.ExecContext(
		ctx,
		`INSERT INTO invites
		 (id, code, created_by, max_uses, uses, expires_at, disabled, created_at)
		 VALUES (?, ?, ?, ?, 0, ?, 0, ?)`,
		id,
		code,
		adminID,
		maxUses,
		expiresAt,
		createdAt,
	)
	if err != nil {
		if isUniqueConstraint(err) {
			return Invite{}, ErrInviteExists
		}
		return Invite{}, fmt.Errorf("creating invite: %w", err)
	}
	return Invite{
		ID:          id,
		Code:        code,
		CreatedBy:   adminID,
		MaxUses:     maxUses,
		ExpiresAt:   expiresAt,
		CreatorName: creatorName,
		CreatedAt:   createdAt,
	}, nil
}

// DisableInvite prevents future registrations from using an invite.
func (s *Store) DisableInvite(ctx context.Context, inviteID string) error {
	result, err := s.db.ExecContext(
		ctx,
		"UPDATE invites SET disabled = 1 WHERE id = ?",
		inviteID,
	)
	if err != nil {
		return fmt.Errorf("disabling invite: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("checking invite update: %w", err)
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

// ListCalendars returns a member's saved plans newest first.
func (s *Store) ListCalendars(ctx context.Context, userID string) ([]Calendar, error) {
	rows, err := s.db.QueryContext(
		ctx,
		"SELECT * FROM calendars WHERE user_id = ? ORDER BY updated_at DESC",
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying calendars: %w", err)
	}
	defer rows.Close()
	return scanCalendars(rows)
}

// CreateCalendar inserts a saved plan while enforcing the per-user limit.
func (s *Store) CreateCalendar(
	ctx context.Context,
	userID, id, title, planJSON, slug, now string,
) (Calendar, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Calendar{}, fmt.Errorf("beginning calendar creation: %w", err)
	}
	defer tx.Rollback()

	var count int
	if err := tx.QueryRowContext(
		ctx,
		"SELECT COUNT(*) FROM calendars WHERE user_id = ?",
		userID,
	).Scan(&count); err != nil {
		return Calendar{}, fmt.Errorf("counting calendars: %w", err)
	}
	if count >= 50 {
		return Calendar{}, ErrCalendarLimit
	}
	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO calendars
		 (id, user_id, title, plan_json, share_slug, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		id,
		userID,
		title,
		planJSON,
		slug,
		now,
		now,
	); err != nil {
		return Calendar{}, fmt.Errorf("inserting calendar: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return Calendar{}, fmt.Errorf("committing calendar creation: %w", err)
	}
	return Calendar{
		ID:        id,
		UserID:    userID,
		Title:     title,
		PlanJSON:  planJSON,
		ShareSlug: slug,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

// GetCalendar returns one member-owned calendar.
func (s *Store) GetCalendar(
	ctx context.Context,
	calendarID, userID string,
) (Calendar, error) {
	return scanCalendar(s.db.QueryRowContext(
		ctx,
		"SELECT * FROM calendars WHERE id = ? AND user_id = ? LIMIT 1",
		calendarID,
		userID,
	))
}

// GetCalendarBySlug returns a calendar whose owner is approved.
func (s *Store) GetCalendarBySlug(ctx context.Context, slug string) (Calendar, error) {
	return scanCalendar(s.db.QueryRowContext(
		ctx,
		`SELECT c.*
		 FROM calendars c
		 JOIN users u ON u.id = c.user_id
		 WHERE c.share_slug = ? AND u.status = 'approved'
		 LIMIT 1`,
		slug,
	))
}

// UpdateCalendar stores a new plan and title.
func (s *Store) UpdateCalendar(
	ctx context.Context,
	userID, calendarID, title, planJSON, updatedAt string,
) error {
	result, err := s.db.ExecContext(
		ctx,
		`UPDATE calendars
		 SET title = ?, plan_json = ?, updated_at = ?
		 WHERE id = ? AND user_id = ?`,
		title,
		planJSON,
		updatedAt,
		calendarID,
		userID,
	)
	if err != nil {
		return fmt.Errorf("updating calendar: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("checking calendar update: %w", err)
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteCalendar removes one member-owned calendar.
func (s *Store) DeleteCalendar(ctx context.Context, calendarID, userID string) error {
	result, err := s.db.ExecContext(
		ctx,
		"DELETE FROM calendars WHERE id = ? AND user_id = ?",
		calendarID,
		userID,
	)
	if err != nil {
		return fmt.Errorf("deleting calendar: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("checking calendar deletion: %w", err)
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

// CalendarIDs returns a member's calendar IDs in stable order.
func (s *Store) CalendarIDs(ctx context.Context, userID string) ([]string, error) {
	rows, err := s.db.QueryContext(
		ctx,
		"SELECT id FROM calendars WHERE user_id = ? ORDER BY created_at, id",
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying calendar IDs: %w", err)
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scanning calendar ID: %w", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating calendar IDs: %w", err)
	}
	return ids, nil
}

// UserStatus returns an account's current status.
func (s *Store) UserStatus(ctx context.Context, userID string) (string, error) {
	var status string
	err := s.db.QueryRowContext(
		ctx,
		"SELECT status FROM users WHERE id = ? LIMIT 1",
		userID,
	).Scan(&status)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("querying user status: %w", err)
	}
	return status, nil
}

// ListCalendarsByUserID returns a member's calendars in stable creation order.
func (s *Store) ListCalendarsByUserID(
	ctx context.Context,
	userID string,
) ([]Calendar, error) {
	rows, err := s.db.QueryContext(
		ctx,
		"SELECT * FROM calendars WHERE user_id = ? ORDER BY created_at, id",
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying member calendars: %w", err)
	}
	defer rows.Close()
	return scanCalendars(rows)
}

// ListApprovedAdmins returns approved administrator accounts.
func (s *Store) ListApprovedAdmins(ctx context.Context) ([]User, error) {
	rows, err := s.db.QueryContext(
		ctx,
		"SELECT * FROM users WHERE role = 'admin' AND status = 'approved' ORDER BY username",
	)
	if err != nil {
		return nil, fmt.Errorf("querying administrators: %w", err)
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		user, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating administrators: %w", err)
	}
	return users, nil
}

// ResetAdminPassword updates one approved administrator and revokes their
// sessions. It backs the server-side recovery command.
func (s *Store) ResetAdminPassword(
	ctx context.Context,
	username, passwordHash, passwordSalt string,
) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("beginning admin recovery: %w", err)
	}
	defer tx.Rollback()

	var userID string
	err = tx.QueryRowContext(
		ctx,
		`SELECT id FROM users
		 WHERE username = ? AND role = 'admin' AND status = 'approved'
		 LIMIT 1`,
		username,
	).Scan(&userID)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("finding administrator: %w", err)
	}
	if _, err := tx.ExecContext(
		ctx,
		"UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?",
		passwordHash,
		passwordSalt,
		userID,
	); err != nil {
		return fmt.Errorf("resetting administrator password: %w", err)
	}
	if _, err := tx.ExecContext(
		ctx,
		"DELETE FROM sessions WHERE user_id = ?",
		userID,
	); err != nil {
		return fmt.Errorf("revoking administrator sessions: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("committing administrator recovery: %w", err)
	}
	return nil
}

type userScanner interface {
	Scan(dest ...any) error
}

func scanUser(row userScanner) (User, error) {
	var user User
	var inviteCode, approvedAt, approvedBy sql.NullString
	err := row.Scan(
		&user.ID,
		&user.Username,
		&user.Nickname,
		&user.PasswordHash,
		&user.PasswordSalt,
		&user.Role,
		&user.Status,
		&inviteCode,
		&user.CreatedAt,
		&approvedAt,
		&approvedBy,
		&user.Locale,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, fmt.Errorf("scanning user: %w", err)
	}
	user.InviteCode = nullStringPointer(inviteCode)
	user.ApprovedAt = nullStringPointer(approvedAt)
	user.ApprovedBy = nullStringPointer(approvedBy)
	return user, nil
}

func scanCalendar(row userScanner) (Calendar, error) {
	var value Calendar
	err := row.Scan(
		&value.ID,
		&value.UserID,
		&value.Title,
		&value.PlanJSON,
		&value.ShareSlug,
		&value.CreatedAt,
		&value.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return Calendar{}, ErrNotFound
	}
	if err != nil {
		return Calendar{}, fmt.Errorf("scanning calendar: %w", err)
	}
	return value, nil
}

func scanCalendars(rows *sql.Rows) ([]Calendar, error) {
	var calendars []Calendar
	for rows.Next() {
		value, err := scanCalendar(rows)
		if err != nil {
			return nil, err
		}
		calendars = append(calendars, value)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating calendars: %w", err)
	}
	return calendars, nil
}

func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func nullStringPointer(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	result := value.String
	return &result
}

func isUniqueConstraint(err error) bool {
	return strings.Contains(err.Error(), "UNIQUE constraint failed")
}

// PlanFromJSON parses a stored plan with the configured timezone fallback.
func PlanFromJSON(data, defaultTimezone string) (calendar.Plan, error) {
	raw, err := decodeAny([]byte(data))
	if err != nil {
		return calendar.Plan{}, err
	}
	return calendar.NormalizePlan(raw, defaultTimezone)
}
