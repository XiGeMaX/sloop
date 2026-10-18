#!/usr/bin/env node

import { pbkdf2Sync, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const PASSWORD_ITERATIONS = 100000;
const DEFAULT_DATABASE = "sloop-db";

class RecoveryError extends Error {}

export function hashPasswordForStorage(password, salt) {
  return pbkdf2Sync(password, Buffer.from(salt, "base64"), PASSWORD_ITERATIONS, 32, "sha256").toString(
    "base64"
  );
}

export function generateTemporaryPassword() {
  return randomBytes(18).toString("base64url");
}

export function normalizeAdminUsername(value) {
  const username = String(value ?? "")
    .trim()
    .normalize("NFKC")
    .toLocaleLowerCase("en-US");
  if (
    username.length < 3 ||
    username.length > 24 ||
    !/^[\p{L}\p{N}_-]+$/u.test(username)
  ) {
    throw new RecoveryError(
      "Username must be 3-24 characters and use only letters, numbers, underscores, or hyphens."
    );
  }
  return username;
}

function validatePassword(password) {
  if (password.length < 8 || password.length > 128) {
    throw new RecoveryError("Password must be 8-128 characters.");
  }
  return password;
}

function usage() {
  return `Reset a Sloop administrator password through Wrangler D1.

Usage:
  pnpm admin:reset -- --username <name> [options]

Options:
  --username <name>       Approved administrator username to reset
  --mode <local|remote>  D1 target; local is the default
  --database <name>      D1 database name or binding (default: ${DEFAULT_DATABASE})
  --persist-to <path>    Local Wrangler persistence directory (Docker: /data)
  --config <path>        Optional Wrangler config path
  --env <name>           Optional Wrangler environment
  --password-stdin       Read the new password from stdin instead of generating one
  --list-admins          List administrator accounts and exit
  --dry-run              Validate the target without changing the password
  --help                 Show this help

Examples:
  pnpm admin:reset -- --username admin
  pnpm admin:reset -- --username admin --mode remote
  docker exec -it sloop pnpm admin:reset -- --username admin --persist-to /data

The command revokes all sessions for the selected administrator. If no password is
provided, print the generated temporary password once and change it after login.
`;
}

function readOption(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new RecoveryError(`${name} requires a value.`);
  }
  return value;
}

export function parseArgs(argv) {
  const options = {
    username: "",
    mode: "local",
    database: DEFAULT_DATABASE,
    persistTo: "",
    config: "",
    env: "",
    passwordStdin: false,
    listAdmins: false,
    dryRun: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") {
      continue;
    } else if (argument === "--username") {
      options.username = readOption(argv, index, argument);
      index += 1;
    } else if (argument === "--mode") {
      options.mode = readOption(argv, index, argument);
      index += 1;
    } else if (argument === "--database") {
      options.database = readOption(argv, index, argument);
      index += 1;
    } else if (argument === "--persist-to") {
      options.persistTo = readOption(argv, index, argument);
      index += 1;
    } else if (argument === "--config") {
      options.config = readOption(argv, index, argument);
      index += 1;
    } else if (argument === "--env") {
      options.env = readOption(argv, index, argument);
      index += 1;
    } else if (argument === "--password-stdin") {
      options.passwordStdin = true;
    } else if (argument === "--list-admins") {
      options.listAdmins = true;
    } else if (argument === "--dry-run") {
      options.dryRun = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new RecoveryError(`Unknown option: ${argument}`);
    }
  }

  if (!["local", "remote"].includes(options.mode)) {
    throw new RecoveryError("--mode must be local or remote.");
  }
  if (!options.help && !options.listAdmins && !options.username) {
    throw new RecoveryError("--username is required unless --list-admins is used.");
  }
  if (!options.help && !options.listAdmins) {
    options.username = normalizeAdminUsername(options.username);
  }
  if (options.passwordStdin && options.listAdmins) {
    throw new RecoveryError("--password-stdin cannot be combined with --list-admins.");
  }
  return options;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function wranglerArgs(options, sql) {
  const args = [
    "exec",
    "wrangler",
    "d1",
    "execute",
    options.database,
    options.mode === "remote" ? "--remote" : "--local",
    "--yes",
    "--json",
    "--command",
    sql
  ];
  if (options.persistTo) args.push("--persist-to", options.persistTo);
  if (options.config) args.push("--config", options.config);
  if (options.env) args.push("--env", options.env);
  return args;
}

function runSql(options, sql) {
  const result = spawnSync("pnpm", wranglerArgs(options, sql), {
    encoding: "utf8",
    env: process.env
  });
  if (result.error) throw new RecoveryError(result.error.message);
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new RecoveryError(detail || `Wrangler exited with status ${result.status}.`);
  }

  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    throw new RecoveryError("Wrangler did not return valid JSON.");
  }
  if (!Array.isArray(payload) || payload.some((entry) => entry.success === false)) {
    throw new RecoveryError("D1 rejected the recovery command.");
  }
  return payload.flatMap((entry) => entry.results || []);
}

function findTargetAdmin(options) {
  return runSql(
    options,
    `SELECT id, username, role, status FROM users WHERE username = ${sqlString(options.username)} COLLATE NOCASE LIMIT 1;`
  )[0];
}

function listAdmins(options) {
  return runSql(
    options,
    "SELECT username, status FROM users WHERE role = 'admin' ORDER BY username;"
  );
}

function readNewPassword(options) {
  if (!options.passwordStdin) return generateTemporaryPassword();
  const password = readFileSync(0, "utf8").replace(/\r?\n$/, "");
  return validatePassword(password);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  if (options.listAdmins) {
    const admins = listAdmins(options);
    if (!admins.length) {
      process.stdout.write("No administrator accounts found.\n");
      return;
    }
    for (const admin of admins) {
      process.stdout.write(`${admin.username}\t${admin.status}\n`);
    }
    return;
  }

  const target = findTargetAdmin(options);
  if (!target) {
    throw new RecoveryError(`No user named "${options.username}" was found.`);
  }
  if (target.role !== "admin") {
    throw new RecoveryError(`"${target.username}" is not an administrator.`);
  }
  if (target.status !== "approved") {
    throw new RecoveryError(
      `"${target.username}" is ${target.status}; only approved administrators can be recovered.`
    );
  }
  if (options.dryRun) {
    process.stdout.write(`Dry run passed: "${target.username}" can be reset on ${options.mode} D1.\n`);
    return;
  }

  const password = readNewPassword(options);
  const salt = randomBytes(16).toString("base64");
  const passwordHash = hashPasswordForStorage(password, salt);
  const userId = sqlString(target.id);

  // Revoke first so an interrupted update fails closed rather than leaving old sessions active.
  runSql(options, `DELETE FROM sessions WHERE user_id = ${userId};`);
  const updated = runSql(
    options,
    `UPDATE users
     SET password_hash = ${sqlString(passwordHash)}, password_salt = ${sqlString(salt)}
     WHERE id = ${userId} AND role = 'admin' AND status = 'approved'
     RETURNING id;`
  );
  if (!updated.length) {
    throw new RecoveryError("The administrator record changed before the update completed.");
  }
  runSql(options, `DELETE FROM sessions WHERE user_id = ${userId};`);

  process.stdout.write(`Administrator password reset: ${target.username}\n`);
  if (!options.passwordStdin) {
    process.stdout.write(`Temporary password: ${password}\n`);
  }
  process.stdout.write(
    "All existing sessions for this administrator were revoked. Change the password after login.\n"
  );
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (entryPoint === import.meta.url) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Admin password recovery failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
