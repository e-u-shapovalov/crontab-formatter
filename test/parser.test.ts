import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveFormat } from "../src/parser";
import { DEFAULT_SETTINGS } from "../src/types";

// With empty text, `auto` system detection depends only on the filename
// heuristic (SYSTEM_FILENAME_RE), which isolates the path-matching logic.
function detectsSystem(filename: string): boolean {
  return resolveFormat("", filename, DEFAULT_SETTINGS).hasUser;
}

test("system layout is detected for real cron.d and /etc/crontab paths", () => {
  assert.equal(detectsSystem("/etc/cron.d/mytab"), true);
  assert.equal(detectsSystem("/etc/cron.d"), true);
  assert.equal(detectsSystem("/srv/cron.d/job"), true);
  assert.equal(detectsSystem("/etc/crontab"), true);
});

test("system layout is NOT triggered by cron.daily / mycron.d look-alikes", () => {
  assert.equal(detectsSystem("/etc/cron.daily/backup"), false);
  assert.equal(detectsSystem("/home/user/cron.daily/tab.crontab"), false);
  assert.equal(detectsSystem("/var/cron.daily/x"), false);
  assert.equal(detectsSystem("/home/user/mycron.d"), false);
  assert.equal(detectsSystem("/home/user/my.crontab"), false);
});

test("etc_crontab / crontab.system aliases match as components, not substrings", () => {
  assert.equal(detectsSystem("/tmp/etc_crontab"), true);
  assert.equal(detectsSystem("/var/spool/crontab.system"), true);
  assert.equal(detectsSystem("/home/etc_crontab_notes"), false);
  assert.equal(detectsSystem("/home/my-crontab.system.bak"), false);
});

// The content heuristic must not read a command-looking first token as a system
// user on an ordinary personal crontab (no system filename).
test("content heuristic biases to user mode for command-looking first tokens", () => {
  const hasUser = (t: string) => resolveFormat(t, "", DEFAULT_SETTINGS).hasUser;
  // flags / command names after the schedule => user crontab, not system
  assert.equal(
    hasUser('0 0 * * * mysql -e "b"\n0 0 * * * postgres pg_dump db'),
    false
  );
  assert.equal(
    hasUser("0 3 * * * date >> /log\n30 4 * * * find /tmp -delete\n0 5 * * * sync"),
    false
  );
  // a genuine system layout (real users + commands) is still detected
  assert.equal(
    hasUser("0 5 * * * root /bin/backup.sh\n30 2 * * * www-data /usr/bin/cleanup"),
    true
  );
});
