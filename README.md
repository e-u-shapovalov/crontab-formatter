# Crontab Formatter for VS Code

[Русская версия](README.RU.md)

Crontab Formatter is a VS Code extension for formatting cron and crontab files into readable, aligned columns. It adds cron syntax highlighting, non-blocking validation, schedule explanations, and opt-in quick fixes while keeping schedule values and the command body unchanged during normal formatting.

It is intended for system administrators, developers, and anyone who reviews user crontabs, `/etc/crontab`, or files under `cron.d` in Visual Studio Code.

## Download and install

The ready-to-use release is [Crontab Formatter v0.3.0](https://github.com/e-u-shapovalov/crontab-formatter/releases/tag/v0.3.0). It requires Visual Studio Code 1.75.0 or later.

> [!IMPORTANT]
> If you are a regular user, do not use Code → Download ZIP. Download the ready-to-use release package from GitHub Releases instead.

Download [`crontab-formatter-0.3.0.vsix`](https://github.com/e-u-shapovalov/crontab-formatter/releases/download/v0.3.0/crontab-formatter-0.3.0.vsix). A VSIX file is a VS Code extension package: install it as a file and do not extract it.

If you are not familiar with GitHub:

1. Open the [Releases page](https://github.com/e-u-shapovalov/crontab-formatter/releases).
2. Open the newest release. The confirmed current release is `v0.3.0`.
3. Expand **Assets** if GitHub has collapsed the list.
4. Download the file ending in `.vsix`. Do not choose **Source code (zip)** or **Source code (tar.gz)**.
5. In VS Code, open **View → Extensions**.
6. Open the Extensions view `…` menu and select **Install from VSIX…**.
7. Select the downloaded file and reload VS Code if prompted.

You can also install the package from a terminal if the VS Code `code` command is available:

```shell
code --install-extension /path/to/crontab-formatter-0.3.0.vsix
```

The confirmed distribution channel for version 0.3.0 is GitHub Releases. If VS Code extension search does not show Crontab Formatter, install the VSIX package using the steps above.

### If you downloaded Source code by mistake

The source archive is for development and is not a ready-to-install extension. Delete or set aside that archive, return to [GitHub Releases](https://github.com/e-u-shapovalov/crontab-formatter/releases), and download `crontab-formatter-0.3.0.vsix` from **Assets**. Developers who intentionally want the source can follow [Building from source](#building-from-source).

## Quick start

1. Open a recognized crontab file, or select **Crontab** or **Cron** as the language mode in the VS Code status bar.
2. Open the Command Palette and run **Crontab: Format Document** or VS Code's standard **Format Document** command.
3. To format automatically, enable Format on Save for the `crontab` and `cron` language IDs:

```jsonc
"[crontab]": {
  "editor.defaultFormatter": "EvgeniiShapovalov.crontab-formatter",
  "editor.formatOnSave": true
},
"[cron]": {
  "editor.defaultFormatter": "EvgeniiShapovalov.crontab-formatter",
  "editor.formatOnSave": true
}
```

The extension edits text in VS Code only. It does not install the file into the system crontab, start cron jobs, or replace the cron service.

## Before and after

Before:

```crontab
0 3 * * 1 /usr/bin/backup.sh
30 0 * * * /usr/bin/cleanup --verbose
*/15 * * * * /usr/bin/health-check
```

After:

```crontab
0     3  *  *  1  /usr/bin/backup.sh
30    0  *  *  *  /usr/bin/cleanup --verbose
*/15  *  *  *  *  /usr/bin/health-check
```

Formatting changes the spacing between columns. It does not rewrite the schedule values or normalize spaces inside the command body.

## Why it is useful

- Native **Format Document**, **Format Selection**, and **Format on Save** support makes cron schedules easier to scan and review.
- User crontabs and system crontabs get the correct column layout, including the system `USER` column.
- Commands remain raw text during normal formatting, so quotes, pipes, redirects, `&&`, `||`, `%`, `$()`, backticks, inline `#`, and internal spaces are not tokenized or normalized.
- Comments, blank lines, environment assignments, and supported `@macros` are handled separately instead of being mistaken for schedules.
- Diagnostics point out suspicious fields and redirections without blocking formatting or claiming to execute the schedule.
- Hover text translates a supported cron expression into English or Russian using [`cronstrue`](https://github.com/bradymholt/cRonstrue).
- Built-in TextMate grammar highlights schedules, commands, environment variables, comments, shell variables, and redirect targets. Exact colors come from the active VS Code theme.

## Features

### Formatting

- Aligns the standard five schedule fields: minute, hour, day of month, month, and day of week.
- Aligns the `USER` field in system crontabs.
- Can explicitly enable a leading seconds field, a trailing year field, or both.
- Aligns supported macro lines such as `@reboot`, `@daily`, and `@hourly`.
- Optionally aligns `=` in environment assignments.
- Optionally aligns trailing redirects and safe trailing comments.
- Optionally inserts a schedule-column reminder header.
- Preserves LF or CRLF line endings and whether the original file has a final newline.
- Produces stable output: formatting an already formatted representative file does not keep changing it.

### Validation and assistance

Soft diagnostics report:

- too few or invalid schedule fields;
- values outside the supported field ranges;
- a zero step such as `*/0`;
- a reversed range such as `18-9`;
- an unknown macro;
- an empty command;
- a missing user in system mode;
- missing, partial, or malformed output redirection.

Missing redirection is an operational hint, not a cron syntax error. Diagnostics are informational and do not block formatting.

The extension also provides:

- English or Russian explanations on hover and through **Crontab: Explain current line**;
- **Crontab: Detect Format**, which reports the detected layout and line counts;
- a completion snippet after typing `*` on an otherwise empty line;
- explicit Code Actions for adding `>/dev/null 2>&1`, adding a `/var/log/...` redirect, appending `2>&1`, replacing a leading bare `php` with `/usr/bin/php`, explaining a schedule, and converting an exact five-field schedule to an equivalent supported macro.

Quick fixes run only when selected. Review every suggested path and redirection before applying it: `/usr/bin/php` may not be the PHP path on your machine, and writing under `/var/log` may require permissions.

## Supported files and cron layouts

VS Code associates the extension with:

- extensions `.crontab` and `.cron`;
- filenames `crontab`, `crontab.tmp`, and `cron`;
- paths matching `**/cron.d/*` and `**/etc/crontab`.

If another filename is used, select **Crontab** or **Cron** as the language mode manually.

Supported line types include:

- user crontab: `MIN HOUR DOM MON DOW COMMAND`;
- system crontab and `cron.d`: `MIN HOUR DOM MON DOW USER COMMAND`;
- optional six- or seven-field layouts when the seconds/year settings are explicitly enabled;
- macros `@reboot`, `@yearly`, `@annually`, `@monthly`, `@weekly`, `@daily`, `@midnight`, and `@hourly`;
- environment assignments such as `PATH=...`, `MAILTO=...`, and `CRON_TZ=...`;
- full-line comments and blank lines.

Cron fields accept `*`, numeric values, comma-separated lists, ranges, and numeric steps. English three-letter month and weekday names are recognized. Scheduler-specific tokens outside this grammar, including Quartz-style `?`, `L`, `W`, and `#`, are not accepted as valid schedule fields and the line is left unformatted.

## Commands

| Command | Purpose |
| --- | --- |
| **Crontab: Format Document** | Format the active cron document. |
| **Crontab: Explain current line** | Show a plain-language explanation for the current schedule. |
| **Crontab: Detect Format** | Report user/system mode, seconds/year flags, line counts, and lines with diagnostics. |

The extension also implements VS Code's standard **Format Selection** action. Column widths are calculated from the whole document so selected lines remain aligned with the rest of the file.

## Settings

Open the Extensions view, select the gear next to Crontab Formatter, and choose **Extension Settings**.

| Setting | Default | Description |
| --- | --- | --- |
| `crontabFormatter.mode` | `auto` | Choose `user`, `system`, or filename/content-based detection. |
| `crontabFormatter.secondsField` | `auto` | Treat the leading field as seconds. `auto` currently behaves as off. |
| `crontabFormatter.yearField` | `auto` | Treat the last schedule field as a year. `auto` currently behaves as off. |
| `crontabFormatter.alignComments` | `false` | Align a trailing `#` comment found outside quotes. |
| `crontabFormatter.alignRedirects` | `false` | Align the first unquoted `>` redirect and its tail. |
| `crontabFormatter.alignEnvEquals` | `false` | Align `=` in environment assignments. |
| `crontabFormatter.insertHeader` | `false` | Insert a `# min hour day month weekday command` reminder. |
| `crontabFormatter.preserveIndentation` | `false` | Keep leading indentation instead of aligning from the left edge. |
| `crontabFormatter.minSpacesBetweenColumns` | `2` | Set the minimum spaces between aligned columns; minimum value is `1`. |
| `crontabFormatter.formatMacros` | `true` | Align supported `@macro` lines. |
| `crontabFormatter.validateOnSave` | `true` | Enable soft diagnostics while editing and when opening or saving a file. |
| `crontabFormatter.explainHover` | `true` | Show a plain-language schedule explanation on hover. |
| `crontabFormatter.locale` | `ru` | Use `ru`, `en`, or `auto` for extension messages and explanations. |

Settings descriptions follow the VS Code display language. `crontabFormatter.locale` controls this extension's diagnostics, messages, and explanations; its current default is Russian.

## Redirect reminder

- `>` overwrites a file.
- `>>` appends to a file.
- `2>&1` sends standard error to the same destination as standard output.
- `command >/dev/null 2>&1` discards both output streams.
- `command >>/var/log/job.log 2>&1` appends both output streams to a log, if the cron user has permission to write there.

These examples explain the extension's redirect hints; they are not applied automatically.

## Limitations and safety notes

- This is a VS Code extension, not a standalone command-line formatter, desktop application, cron daemon, or crontab installer.
- Formatting does not prove that a job will run. Environment, permissions, executable paths, shell behavior, time zones, and the host cron implementation still determine runtime behavior.
- Automatic user/system detection is heuristic. Ambiguous files, especially a single system-style line under an unusual filename, may need `crontabFormatter.mode` set explicitly.
- `secondsField: auto` and `yearField: auto` are deliberately off. Enable either field explicitly when the file uses it.
- Advanced scheduler dialects are not fully supported. In particular, enabling seconds/year fields does not add support for all Quartz operators.
- The schedule explainer omits the year field when producing human-readable text.
- Invalid or incomplete schedule lines are preserved instead of force-formatted.
- In the published `v0.3.0` VSIX, `alignRedirects` and `alignComments` are off by default. Their splitter understands single quotes, double quotes, and backticks, but does not model nested shell syntax such as `$()`; review the diff when enabling these options for complex commands.
- `insertHeader` adds a new comment line. When it is enabled, formatting a selection can format the entire document because the line count changes.
- Diagnostics are a focused set of hints, not a complete crontab validator. Version 0.3.0 does not check whether command paths are absolute.
- In the published `v0.3.0` VSIX, the titles of the “explain schedule” and “convert to macro” Code Actions remain in Russian even when the extension locale is English. Their behavior is unchanged.
- Syntax highlighting is based on the standard five-field layout; optional seconds/year layouts may not receive the intended scopes for every token.

Always review the formatted diff before installing a crontab on a production system.

## Troubleshooting

### VS Code says the downloaded file is not a valid extension

Make sure the filename ends in `.vsix` and that you downloaded it from the release's **Assets** list. A GitHub **Source code** ZIP is not a VSIX package. Download the asset again and install it through **Install from VSIX…**. Also confirm that VS Code is version 1.75.0 or later.

### The Crontab commands do not appear

Check the language indicator in the lower-right corner of VS Code. Select **Crontab** or **Cron**, then reopen the Command Palette. Reload VS Code once if the extension was just installed.

### Format Document makes no change

The line may be incomplete or use unsupported field syntax, in which case it is intentionally preserved. Check the Problems panel, confirm `crontabFormatter.mode`, and explicitly configure seconds/year fields if the file has more than five time fields.

### A system crontab is aligned as a user crontab

Set `crontabFormatter.mode` to `system`. Automatic detection uses the filename and file contents and can be ambiguous for short files.

### Format on Save does not run

Set Crontab Formatter as `editor.defaultFormatter` for the active language ID and enable `editor.formatOnSave`. Use both `[crontab]` and `[cron]` blocks if your workspace contains both file types; see [Quick start](#quick-start).

### Redirect hints are too noisy

They are informational advice. Disable `crontabFormatter.validateOnSave` if you do not want diagnostics, or keep it enabled and ignore the hints that do not apply to your cron environment.

### Some quick-action titles are in Russian

This is a known localization limitation in the published version 0.3.0 VSIX for two Code Actions. Other extension messages follow `crontabFormatter.locale`.

## FAQ

### What should a regular user download?

Download `crontab-formatter-0.3.0.vsix` from [GitHub Releases](https://github.com/e-u-shapovalov/crontab-formatter/releases), then use **Install from VSIX…** in VS Code.

### Why should I not use Code → Download ZIP?

That button downloads repository source files. VS Code expects the packaged `.vsix` asset for a normal installation.

### Does formatting change when a cron job runs?

Normal formatting does not rewrite schedule values. It aligns their text columns. Explicit quick fixes and opt-in settings such as header insertion make the changes described by their names, so review the diff before applying the crontab.

### Does the extension install or run cron jobs?

No. It edits cron text inside VS Code. Use the tools provided by your operating system to install, list, test, or run cron jobs.

### Is there a standalone CLI?

No standalone CLI is defined by this project. The `code --install-extension` command installs the extension into VS Code; it does not format a crontab from the terminal.

### Are six- and seven-field cron expressions supported?

The formatter can add a leading seconds field and a trailing year field when configured explicitly. Automatic detection for both currently behaves as off, and advanced Quartz-specific operators are not supported.

### Which interface languages are available?

The extension provides English and Russian messages and explanations. Package settings and command titles are localized according to the VS Code display language, subject to the published version 0.3.0 Code Action limitation noted above.

## Building from source

Building is for contributors or users who intentionally want to inspect the source. Regular users should install the release VSIX.

Requirements:

- Git;
- Node.js and npm; the project does not declare an exact minimum Node.js version;
- Visual Studio Code 1.75.0 or later to run the extension.

Clone, install dependencies, compile, and test:

```shell
git clone https://github.com/e-u-shapovalov/crontab-formatter.git
cd crontab-formatter
npm ci
npm run compile
npm test
```

Create a VSIX and install that build:

```shell
npm run package
code --install-extension crontab-formatter-0.3.0.vsix
```

The packaging script invokes `npx vsce package --ignoreFile .vsce-pack-ignore`; `npx` may need network access to obtain the packaging tool when it is not already cached. The repository does not include a tracked VS Code launch configuration for an Extension Development Host.

Available npm scripts:

| Script | Action |
| --- | --- |
| `npm run compile` | Compile TypeScript into `out/`. |
| `npm run watch` | Recompile TypeScript when source files change. |
| `npm test` | Compile and run the Node.js test suite from `out/test/`. |
| `npm run package` | Build a `.vsix` package with `vsce`. |

The extension entry point is `out/src/extension.js`, compiled from `src/extension.ts`. Parser, formatter, validator, and explainer logic are separated from the VS Code integration so they can be unit-tested. The runtime dependency is `cronstrue`; TypeScript and the Node.js/VS Code type packages are development dependencies.

## Feedback and support

Report reproducible bugs and documentation problems in [GitHub Issues](https://github.com/e-u-shapovalov/crontab-formatter/issues). Include the VS Code version, extension version, relevant settings, file layout (user or system), a minimal crontab example with secrets removed, and the result you expected.

Author: [Evgenii Shapovalov](https://github.com/e-u-shapovalov).

## License and attribution

Crontab Formatter is available under the [MIT License](LICENSE), copyright © 2026 Evgenii Shapovalov.

Human-readable schedule explanations are powered by [`cronstrue`](https://github.com/bradymholt/cRonstrue), which is distributed under its own MIT license included in the extension package.
