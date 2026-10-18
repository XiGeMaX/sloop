import assert from "node:assert/strict";
import { pbkdf2Sync } from "node:crypto";
import test from "node:test";
import {
  generateTemporaryPassword,
  hashPasswordForStorage,
  normalizeAdminUsername,
  parseArgs
} from "../scripts/reset-admin-password.mjs";

test("admin recovery hashes passwords compatibly with the Worker", () => {
  const salt = Buffer.alloc(16, 9).toString("base64");
  const expected = pbkdf2Sync("recovery-password", Buffer.from(salt, "base64"), 210000, 32, "sha256")
    .toString("base64");
  assert.equal(hashPasswordForStorage("recovery-password", salt), expected);
});

test("admin recovery normalizes usernames and generates strong temporary passwords", () => {
  assert.equal(normalizeAdminUsername("  ＡＤＭＩＮ_01  "), "admin_01");
  const password = generateTemporaryPassword();
  assert.match(password, /^[A-Za-z0-9_-]{20,32}$/);
  assert.notEqual(password, generateTemporaryPassword());
});

test("admin recovery parses deployment-specific D1 options", () => {
  assert.deepEqual(
    parseArgs([
      "--username",
      "Admin",
      "--mode",
      "remote",
      "--env",
      "production",
      "--password-stdin"
    ]),
    {
      username: "admin",
      mode: "remote",
      database: "sloop-db",
      persistTo: "",
      config: "",
      env: "production",
      passwordStdin: true,
      listAdmins: false,
      dryRun: false,
      help: false
    }
  );
});
