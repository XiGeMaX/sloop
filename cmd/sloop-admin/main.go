package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	_ "time/tzdata"

	"github.com/xigemax/sloop/internal/calendar"
	"github.com/xigemax/sloop/internal/security"
	"github.com/xigemax/sloop/internal/store"
)

func main() {
	if err := run(os.Args[1:], os.Stdin, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run(args []string, stdin io.Reader, stdout io.Writer) error {
	flags := flag.NewFlagSet("sloop-admin", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	database := flags.String(
		"database",
		defaultDatabasePath(),
		"SQLite database path",
	)
	username := flags.String("username", "", "administrator username")
	passwordStdin := flags.Bool(
		"password-stdin",
		false,
		"read the replacement password from standard input",
	)
	list := flags.Bool("list", false, "list approved administrators")
	dryRun := flags.Bool("dry-run", false, "validate the target without changing data")
	if err := flags.Parse(args); err != nil {
		return fmt.Errorf("%w; use --help for usage", err)
	}
	if *list {
		return listAdmins(stdout, *database)
	}
	if strings.TrimSpace(*username) == "" {
		return errors.New("--username is required")
	}
	normalizedUsername, err := calendar.NormalizeUsername(*username)
	if err != nil {
		return errors.New("username must be 3-24 letters, numbers, underscores, or hyphens")
	}

	ctx := context.Background()
	databaseStore, err := store.Open(ctx, *database)
	if err != nil {
		return err
	}
	defer databaseStore.Close()

	if *dryRun {
		admins, err := databaseStore.ListApprovedAdmins(ctx)
		if err != nil {
			return err
		}
		for _, admin := range admins {
			if admin.Username == normalizedUsername {
				fmt.Fprintf(stdout, "Dry run passed: %q can be reset.\n", normalizedUsername)
				return nil
			}
		}
		return fmt.Errorf("approved administrator %q not found", normalizedUsername)
	}

	password := ""
	if *passwordStdin {
		data, err := io.ReadAll(io.LimitReader(stdin, 4096))
		if err != nil {
			return fmt.Errorf("reading password: %w", err)
		}
		password = strings.TrimSpace(string(data))
		if _, err := calendar.NormalizePassword(password); err != nil {
			return errors.New("password must be 8-128 characters")
		}
	} else {
		password, err = security.GenerateRecoveryPassword()
		if err != nil {
			return err
		}
	}

	salt, err := security.NewSalt()
	if err != nil {
		return err
	}
	passwordHash, err := security.HashPassword(password, salt)
	if err != nil {
		return err
	}
	if err := databaseStore.ResetAdminPassword(
		ctx,
		normalizedUsername,
		passwordHash,
		salt,
	); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return fmt.Errorf("approved administrator %q not found", normalizedUsername)
		}
		return err
	}
	if *passwordStdin {
		fmt.Fprintf(stdout, "Password reset for %q.\n", normalizedUsername)
	} else {
		fmt.Fprintf(
			stdout,
			"Password reset for %q.\nTemporary password: %s\n",
			normalizedUsername,
			password,
		)
	}
	return nil
}

func listAdmins(stdout io.Writer, database string) error {
	ctx := context.Background()
	databaseStore, err := store.Open(ctx, database)
	if err != nil {
		return err
	}
	defer databaseStore.Close()
	admins, err := databaseStore.ListApprovedAdmins(ctx)
	if err != nil {
		return err
	}
	if len(admins) == 0 {
		fmt.Fprintln(stdout, "No approved administrators found.")
		return nil
	}
	for _, admin := range admins {
		fmt.Fprintf(stdout, "%s\t%s\n", admin.Username, admin.Nickname)
	}
	return nil
}

func defaultDatabasePath() string {
	if value := strings.TrimSpace(os.Getenv("SLOOP_DATABASE_PATH")); value != "" {
		return value
	}
	return filepath.Join(".", "data", "sloop.db")
}
