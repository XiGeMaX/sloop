// Package migrations embeds the SQLite schema migrations in the server binary.
package migrations

import "embed"

// Files contains the ordered SQLite migration scripts.
//
//go:embed *.sql
var Files embed.FS
