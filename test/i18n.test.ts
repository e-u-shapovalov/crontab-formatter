import { test } from "node:test";
import assert from "node:assert/strict";

import { t } from "../src/i18n";

// The code-action titles are localized through t(); guard against a regression
// back to hardcoded literals by asserting both keys resolve and differ by locale.
test("code action titles are localized", () => {
  assert.notEqual(t("en", "action.explain"), t("ru", "action.explain"));
  assert.notEqual(
    t("en", "action.convert", "@daily"),
    t("ru", "action.convert", "@daily")
  );
  assert.ok(t("en", "action.convert", "@daily").includes("@daily"));
  assert.ok(t("ru", "action.convert", "@daily").includes("@daily"));
});
