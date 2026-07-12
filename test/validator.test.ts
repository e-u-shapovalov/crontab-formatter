import { test } from "node:test";
import assert from "node:assert/strict";

import { validateDocument } from "../src/validator";
import { DEFAULT_SETTINGS, FormatterSettings } from "../src/types";

function s(overrides: Partial<FormatterSettings> = {}): FormatterSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

function codes(text: string, settings = s(), locale: "ru" | "en" = "en") {
  return validateDocument(text, settings, "crontab", locale).map((d) => d.code);
}

test("empty input yields no diagnostics", () => {
  assert.deepEqual(validateDocument("", s(), "crontab", "en"), []);
});

test("out-of-range minute is flagged", () => {
  assert.ok(codes("99 0 * * * /bin/x >/dev/null 2>&1").includes("out-of-range"));
});

test("zero step is flagged", () => {
  assert.ok(codes("*/0 * * * * /bin/x >/dev/null 2>&1").includes("zero-step"));
});

test("unknown macro is flagged", () => {
  assert.ok(codes("@frobnicate /x").includes("unknown-macro"));
});

test("no redirect produces a hint", () => {
  assert.ok(codes("* * * * * /bin/x").includes("no-redirect"));
});

test("stdout-only redirect suggests adding stderr", () => {
  const c = codes("* * * * * /bin/x > /var/log/x.log");
  assert.ok(c.includes("stderr-not-redirected"));
  assert.ok(!c.includes("no-redirect"));
});

test("malformed redirect like >1&2 is flagged", () => {
  assert.ok(
    codes("* * * * * /bin/x > /var/log/x.log >1&2").includes("bad-redirect")
  );
});

test("proper >/dev/null 2>&1 is clean of redirect hints", () => {
  const c = codes("* * * * * /bin/x >/dev/null 2>&1");
  assert.ok(!c.includes("no-redirect"));
  assert.ok(!c.includes("stderr-not-redirected"));
  assert.ok(!c.includes("bad-redirect"));
});

test("# inside quotes is not treated as a comment for redirect checks", () => {
  // a quoted > must not count as a redirect
  const c = codes('* * * * * echo "a > b"');
  assert.ok(c.includes("no-redirect"), JSON.stringify(c));
});

test("> inside $(...) is not counted as an output redirect", () => {
  // the > redirects the subshell's echo, not the cron job's stdout
  const c = codes("* * * * * sh -c $(echo hi > /tmp/x)");
  assert.ok(c.includes("no-redirect"), JSON.stringify(c));
  assert.ok(!c.includes("stderr-not-redirected"), JSON.stringify(c));
});

test("a > inside a trailing comment is not counted as a redirect", () => {
  const c = codes("* * * * * cmd # example > /tmp/log");
  assert.ok(c.includes("no-redirect"), JSON.stringify(c));
  assert.ok(!c.includes("stderr-not-redirected"), JSON.stringify(c));
});

test("a clean redirect before a trailing comment is recognised as complete", () => {
  const c = codes("* * * * * cmd >/tmp/log 2>&1 # note");
  assert.ok(!c.includes("no-redirect"), JSON.stringify(c));
  assert.ok(!c.includes("stderr-not-redirected"), JSON.stringify(c));
});

test("system mode without a user is flagged", () => {
  const c = codes("0 0 * * * /bin/x >/dev/null 2>&1", s({ mode: "system" }));
  assert.ok(c.includes("missing-user"));
});

test("messages are localized (ru differs from en)", () => {
  const ru = validateDocument(
    "* * * * * /bin/x",
    s(),
    "crontab",
    "ru"
  )[0].message;
  const en = validateDocument(
    "* * * * * /bin/x",
    s(),
    "crontab",
    "en"
  )[0].message;
  assert.notEqual(ru, en);
});
