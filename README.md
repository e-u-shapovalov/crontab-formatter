# Crontab Formatter

A practical formatter for crontab files. Aligns schedules into clean columns
via VS Code's native **Format Document / Format Selection / Format on Save** —
and never changes the meaning of a command or a schedule.

## Before / After

```crontab
0 3 * * 1 /usr/bin/backup.sh
30 0 * * * root /opt/scripts/cleanup --verbose
*/15 * * * * curl -s http://localhost/health
```

```crontab
0     3  *  *  1  /usr/bin/backup.sh
30    0  *  *  *  root /opt/scripts/cleanup --verbose
*/15  *  *  *  *  curl -s http://localhost/health
```

## What it does

- **Column alignment** of the time fields (and the system `USER` column).
- **Commands are never touched** — quotes, pipes, redirects, `&&`, `||`, `%`,
  `$()`, backticks and inline `#` are preserved byte-for-byte. Internal
  whitespace is not normalized.
- **Idempotent**: formatting an already-formatted file changes nothing.
- **Supported line types**: user crontab (`MIN HOUR DOM MON DOW COMMAND`),
  system crontab / `cron.d` (adds `USER`), macros (`@reboot`, `@daily`, …),
  environment assignments (`PATH=…`, `MAILTO=…`, `CRON_TZ=…`), comments and
  blank lines — each handled correctly and left intact when it should be.
- **Soft validation** (diagnostics): field ranges, `*/0`, reversed ranges,
  unknown macros, missing user in system mode, relative paths, and missing
  output redirection — all as warnings/hints, never blocking formatting.
- **Hover explanation** of the schedule (powered by cronstrue, `ru`/`en`).
- **Safe quick fixes** (Code Actions): add `>/dev/null 2>&1`, add a log
  redirect, insert absolute `/usr/bin/php`, explain the schedule, and convert
  an exact schedule to its `@macro` — **only when you ask**. The formatter
  itself never rewrites a schedule.

## Commands

- **Crontab: Format Document**
- **Crontab: Explain current line**
- **Crontab: Detect Format** — reports user/system, seconds, and line counts.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `crontabFormatter.mode` | `auto` | `auto` / `user` / `system` field layout. |
| `crontabFormatter.secondsField` | `auto` | Leading seconds field (`auto`=off). |
| `crontabFormatter.yearField` | `auto` | Trailing year field (`auto`=off). |
| `crontabFormatter.alignComments` | `false` | Align safe trailing `#` comments. |
| `crontabFormatter.alignRedirects` | `false` | Align the `>`/`>>`/`2>&1` tail into its own column. |
| `crontabFormatter.alignEnvEquals` | `false` | Align `=` in env assignments. |
| `crontabFormatter.insertHeader` | `false` | Insert a `# min hour day month weekday command` reminder at the top. |
| `crontabFormatter.preserveIndentation` | `false` | Keep leading whitespace (off = align from the left edge). |
| `crontabFormatter.minSpacesBetweenColumns` | `2` | Spaces between columns. |
| `crontabFormatter.formatMacros` | `true` | Align `@macro` lines. |
| `crontabFormatter.validateOnSave` | `true` | Run diagnostics. |
| `crontabFormatter.explainHover` | `true` | Schedule explanation on hover. |
| `crontabFormatter.locale` | `ru` | UI language: `auto` / `ru` / `en`. |

Tip: in the **Extensions** view, the ⚙️ gear → **Extension Settings** jumps straight to these.

### Redirect cheat sheet

- `>` overwrites the file (old logs are wiped).
- `>>` appends to the end of the file.
- `2>&1` sends errors (stderr) to the same place as the output (stdout).
- Common forms: `command >/dev/null 2>&1` (discard) or `command >>/var/log/x.log 2>&1` (keep a log).

The validator flags missing/half/malformed redirections (e.g. `>1&2`) with the correct form, and typing `*` on an empty line offers to fill the whole schedule.

## Usage

Open a crontab file and run **Format Document** (`Shift+Alt+F`), or enable
format on save:

```jsonc
"[crontab]": {
  "editor.defaultFormatter": "EvgeniiShapovalov.crontab-formatter",
  "editor.formatOnSave": true
}
```

The extension registers the `crontab` language id, so it coexists with syntax
highlighters such as `hogashi.crontab-syntax-highlight` — the highlighter
colours, this extension formats.

## License

MIT © Evgenii Shapovalov
