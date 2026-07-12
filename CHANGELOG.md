# Changelog

All notable changes to the Crontab Formatter extension are documented in this
file.

## 0.3.0

Initial public release.

- Column alignment of crontab time fields (and the system `USER` column) via the
  native **Format Document / Format Selection / Format on Save** — the command
  text is left byte-for-byte intact and formatting is idempotent.
- Recognises user crontab, system crontab / `cron.d` (with a `USER` column),
  `@macros`, environment assignments, comments and blank lines, with automatic
  detection of the user/system layout.
- Optional alignment of the redirect tail (`>`/`>>`/`2>&1`), safe trailing
  comments and env `=`, plus an optional header reminder line.
- Soft, non-blocking diagnostics: field ranges, `*/0`, reversed ranges, unknown
  macros, missing user in system mode and missing/malformed output redirection.
- Schedule explanation on hover and on demand (powered by cronstrue, `ru`/`en`).
- Safe quick fixes: add `>/dev/null 2>&1`, add a log redirect, insert an
  absolute `/usr/bin/php`, explain the schedule and convert an exact schedule to
  its `@macro` — all opt-in, never automatic.
- Bundled TextMate grammar for syntax highlighting.
