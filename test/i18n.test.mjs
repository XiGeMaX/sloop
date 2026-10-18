import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getLanguage, plural, setLanguage, t } from "../public/i18n.js";

test("i18next resources translate and interpolate messages", async () => {
  await setLanguage("en", { persist: false });

  assert.equal(getLanguage(), "en");
  assert.equal(t("builder.title"), "Rotation shifts");
  assert.equal(t("validation.shiftName", { index: 3 }), "Day 3 needs a name");
  assert.equal(plural("units.months", 1), "1 month");
  assert.equal(plural("units.months", 6), "6 months");
  assert.equal(t("errors.not_found"), "Not found");
});

test("unknown translation keys remain visible for diagnostics", async () => {
  await setLanguage("en", { persist: false });
  assert.equal(t("missing.translation.key"), "missing.translation.key");
});

test("every static translation binding exists in both languages", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const keys = new Set(
    [...html.matchAll(/data-i18n(?:-aria-label|-content|-placeholder|-title)?="([^"]+)"/g)].map(
      (match) => match[1]
    )
  );

  for (const locale of ["zh-CN", "en"]) {
    await setLanguage(locale, { persist: false });
    for (const key of keys) {
      assert.notEqual(t(key), key, `${locale} is missing ${key}`);
    }
  }
});
