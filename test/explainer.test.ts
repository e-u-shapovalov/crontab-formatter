import { test } from "node:test";
import assert from "node:assert/strict";

import { explainLine } from "../src/explainer";
import { DEFAULT_SETTINGS, FormatterSettings } from "../src/types";

function s(o: Partial<FormatterSettings> = {}): FormatterSettings {
  return { ...DEFAULT_SETTINGS, ...o };
}

test("explains a basic 5-field schedule", () => {
  const out = explainLine("0 9 * * 1 /x", 0, s({ mode: "user" }), "en");
  assert.ok(out && /09:?00/.test(out), String(out));
});

test("includes the year field when yearField is enabled", () => {
  const out = explainLine(
    "0 0 1 1 * 2099 /x",
    0,
    s({ mode: "user", yearField: "true" }),
    "en"
  );
  assert.ok(out && out.includes("2099"), String(out));
});

test("handles a leading seconds field", () => {
  const out = explainLine(
    "30 0 9 * * * /x",
    0,
    s({ mode: "user", secondsField: "true" }),
    "en"
  );
  assert.ok(out, String(out));
});

test("returns null for a zero-step schedule (consistent with the warning)", () => {
  assert.equal(explainLine("*/0 5 * * * /x", 0, s({ mode: "user" }), "en"), null);
});

test("@reboot explains as startup; an unknown macro is null", () => {
  assert.ok(explainLine("@reboot /x", 0, s(), "en"));
  assert.equal(explainLine("@frobnicate /x", 0, s(), "en"), null);
});
