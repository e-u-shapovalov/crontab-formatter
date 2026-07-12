/**
 * Pure crontab formatter. Aligns time fields (and optionally the user, redirect
 * and comment columns) into a grid; never touches the command text itself.
 * Idempotent: formatting already-formatted output is a no-op, because separators
 * are plain whitespace and the command is preserved as a raw slice.
 */

import { CronLine, FormatterSettings, MacroLine, ParsedDocument } from "./types";
import { parseDocument, resolveFormat } from "./parser";
import { getFieldMetas } from "./fields";

const HEADER_LABEL: Record<string, string> = {
  second: "sec",
  minute: "min",
  hour: "hour",
  "day-of-month": "day",
  month: "month",
  "day-of-week": "weekday",
  year: "year",
};

/**
 * Blank out every character that is not at the shell top level, preserving
 * length. Callers scan the mask for a *top-level* `>` or `#` and slice the
 * original string at the same index, so a redirect or `#` hidden inside a
 * command is never split off.
 *
 * A stack of nesting contexts is tracked so that quotes nested inside a
 * substitution (e.g. `"$(printf "x")"`) are handled correctly — the inner `"`
 * opens its own context instead of closing the outer one. Handled: single
 * quotes (fully literal), double quotes, backticks, `$(…)` command
 * substitution, `<(…)`/`>(…)` process substitution and bare `(…)` subshell
 * groups. A backslash escapes the next character everywhere except inside
 * single quotes, so `\"`, `\>`, `\#` and `\$` are treated as literals.
 */
export function maskNonTopLevel(s: string): string {
  let out = "";
  // Each frame is a nesting context; anything with a non-empty stack is masked.
  // "subst" covers $( / <( / >( / bare `(` and tracks its own paren depth.
  const stack: { type: "single" | "double" | "backtick" | "subst"; depth: number }[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const top = stack.length > 0 ? stack[stack.length - 1] : undefined;

    // Single quotes: fully literal, no escaping, until the closing quote.
    if (top && top.type === "single") {
      out += " ";
      if (c === "'") stack.pop();
      continue;
    }

    // A backslash escapes the next character in every other context.
    if (c === "\\") {
      out += " ";
      if (i + 1 < s.length) {
        out += " ";
        i++;
      }
      continue;
    }

    // Backticks: masked verbatim until the closing backtick (kept simple — no
    // substitution parsing inside).
    if (top && top.type === "backtick") {
      out += " ";
      if (c === "`") stack.pop();
      continue;
    }

    // A command / process substitution can open at the top level and inside a
    // double quote or another substitution.
    if ((c === "$" || c === "<" || c === ">") && s[i + 1] === "(") {
      stack.push({ type: "subst", depth: 0 });
      out += "  "; // blank the marker and `(`
      i++;
      continue;
    }

    if (top && top.type === "subst") {
      if (c === "(") top.depth++;
      else if (c === ")") {
        if (top.depth === 0) stack.pop();
        else top.depth--;
      } else if (c === "'") stack.push({ type: "single", depth: 0 });
      else if (c === '"') stack.push({ type: "double", depth: 0 });
      else if (c === "`") stack.push({ type: "backtick", depth: 0 });
      out += " ";
      continue;
    }

    if (top && top.type === "double") {
      if (c === '"') stack.pop();
      else if (c === "`") stack.push({ type: "backtick", depth: 0 });
      out += " ";
      continue;
    }

    // Top level (stack empty).
    if (c === "'") { stack.push({ type: "single", depth: 0 }); out += " "; continue; }
    if (c === '"') { stack.push({ type: "double", depth: 0 }); out += " "; continue; }
    if (c === "`") { stack.push({ type: "backtick", depth: 0 }); out += " "; continue; }
    if (c === "(") { stack.push({ type: "subst", depth: 0 }); out += " "; continue; }
    out += c;
  }
  return out;
}

/**
 * Detect a trailing inline comment that is safe to split off (a `#` outside any
 * quotes/backticks/`$(...)`, preceded by whitespace). Returns null when none is
 * found.
 */
export function detectTrailingComment(
  cmd: string
): { code: string; comment: string } | null {
  const mask = maskNonTopLevel(cmd);
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === "#" && i > 0 && /\s/.test(cmd[i - 1])) {
      return { code: cmd.slice(0, i).replace(/\s+$/, ""), comment: cmd.slice(i) };
    }
  }
  return null;
}

/**
 * Split a command at its first top-level output redirection, so the redirect
 * tail can be aligned into its own column. A `>` inside quotes/backticks or a
 * substitution is ignored. A file-descriptor / `&` prefix (`2>&1`, `&>file`) is
 * kept with the redirect only when it is a standalone shell token — preceded by
 * whitespace or the start of the command. When the operator is fused to the
 * preceding word (`python2>`, `cmd&>`) or is a compound read/write redirect
 * (`<>`), the split would change the command, so we skip alignment (return null)
 * to keep the command byte-for-byte intact.
 */
export function detectRedirect(
  code: string
): { body: string; redirect: string } | null {
  // A `>` inside a trailing shell comment is not a redirect — restrict the
  // search to the code before any top-level `#`. The comment itself stays with
  // whichever slice (body or redirect) so the command is never modified.
  const tc = detectTrailingComment(code);
  const limit = tc ? code.length - tc.comment.length : code.length;
  const i = maskNonTopLevel(code).slice(0, limit).indexOf(">");
  if (i === -1) {
    return null;
  }
  let start = i;
  while (start > 0) {
    const p = code[start - 1];
    if (p === "&" || /[0-9]/.test(p)) start--;
    else break;
  }
  // The redirect operator (with any fd/& prefix) must be a standalone token.
  // If a non-whitespace character precedes it, it is fused to the previous word
  // (or is a `<>`/`3<>` compound) — splitting would alter the command.
  if (start > 0 && !/\s/.test(code[start - 1])) {
    return null;
  }
  const body = code.slice(0, start).replace(/\s+$/, "");
  if (body === "") {
    return null;
  }
  return { body, redirect: code.slice(start).replace(/\s+$/, "") };
}

export interface RedirectState {
  /** True when fd 1 (stdout) ends up at a file/sink rather than the console. */
  stdout: boolean;
  /** True when fd 2 (stderr) ends up at a file/sink rather than the console. */
  stderr: boolean;
  /** A malformed `>N&M`-style redirect, if any (for a `bad-redirect` hint). */
  bad: string | null;
}

/**
 * Simulate where stdout (fd 1) and stderr (fd 2) point after the top-level
 * output redirections in a command, left to right. This models order and
 * duplication (`2>&1`, `1>&2`), so `cmd 2>&1` reports stdout still on the
 * console, while `cmd >f 2>&1` reports both captured and `cmd 2>&1 >f` reports
 * stderr still on the console. Shared by the validator and the code-action
 * provider so hints and quick fixes agree. Redirects inside quotes/backticks/
 * substitutions are ignored via `maskNonTopLevel`.
 */
export function analyzeRedirects(command: string): RedirectState {
  const code = maskNonTopLevel(command);
  // A typo like `>1&2` (fd/`&` glued to `>` with no spaces). `> 2 &` (redirect
  // to a file then background) is valid and must NOT match.
  const badMatch = code.match(/>\d+&\d*/);
  // sinks: false = console (cron mail), true = a file/sink
  let fd1 = false;
  let fd2 = false;
  const re = /(\d*)>&(\d+)|&>>?|>&|(\d*)>>?\|?|(\d*)<>|(\d*)</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (m[0] === "") {
      re.lastIndex++; // guard against a zero-width match
      continue;
    }
    if (m[2] !== undefined) {
      // duplication: (m1 || 1)>&(m2)
      const from = m[1] === "" ? 1 : parseInt(m[1], 10);
      const to = parseInt(m[2], 10);
      const src: boolean = to === 1 ? fd1 : to === 2 ? fd2 : false;
      if (from === 1) fd1 = src;
      else if (from === 2) fd2 = src;
    } else if (m[4] !== undefined || m[5] !== undefined) {
      // `<>` read/write or `<` input redirect — not an stdout/stderr sink.
    } else if (m[0][0] === "&") {
      // `&>file`, `&>>file` — both streams to a file.
      fd1 = true;
      fd2 = true;
    } else if (m[0] === ">&") {
      // `>&file` (no fd after `&`) is an alias for `1>file` — stdout only.
      fd1 = true;
    } else if (m[0].includes(">")) {
      // `>`, `>>`, `2>`, `2>>`, `>|` — a plain file redirect on fd (m3 || 1),
      // optionally followed by an `&N` duplication (`2>>&1`).
      const fd = !m[3] ? 1 : parseInt(m[3], 10);
      const dup = code.slice(re.lastIndex).match(/^&(\d+)/);
      if (dup) {
        const to = parseInt(dup[1], 10);
        const src: boolean = to === 1 ? fd1 : to === 2 ? fd2 : false;
        if (fd === 1) fd1 = src;
        else if (fd === 2) fd2 = src;
        re.lastIndex += dup[0].length;
      } else if (fd === 1) {
        fd1 = true;
      } else if (fd === 2) {
        fd2 = true;
      }
    }
  }
  return { stdout: fd1, stderr: fd2, bad: badMatch ? badMatch[0].trim() : null };
}

function splitTail(
  command: string,
  settings: FormatterSettings
): { body: string; redirect: string | null; comment: string | null } {
  let comment: string | null = null;
  let code = command;
  if (settings.alignComments) {
    const tc = detectTrailingComment(command);
    if (tc) {
      comment = tc.comment;
      code = tc.code;
    }
  }
  let body = code;
  let redirect: string | null = null;
  if (settings.alignRedirects) {
    const rd = detectRedirect(code);
    if (rd) {
      body = rd.body;
      redirect = rd.redirect;
    }
  }
  return { body, redirect, comment };
}

function isCron(line: { kind: string }): line is CronLine {
  return line.kind === "cron";
}

function isMacro(line: { kind: string }): line is MacroLine {
  return line.kind === "macro";
}

export function formatDocument(
  text: string,
  settings: FormatterSettings,
  filename = ""
): string {
  const fmt = resolveFormat(text, filename, settings);
  const doc = parseDocument(text, fmt);
  return formatParsed(doc, settings);
}

export function formatParsed(
  doc: ParsedDocument,
  settings: FormatterSettings
): string {
  const fmt = doc.format;
  const sep = " ".repeat(Math.max(1, settings.minSpacesBetweenColumns));
  const lead = (indent: string) => (settings.preserveIndentation ? indent : "");
  const alignTail = settings.alignRedirects || settings.alignComments;

  const metas = getFieldMetas(fmt);
  const labels = metas.map((m) => HEADER_LABEL[m.name] ?? m.name);

  const cronLines = doc.lines.filter(
    (l): l is CronLine => isCron(l) && l.complete
  );
  const macroLines = doc.lines.filter(isMacro);

  // Column widths. When inserting a header, seed widths with the label lengths
  // so the data columns are at least as wide as their labels.
  const fieldWidths = new Array(fmt.timeFieldCount).fill(0);
  let userWidth = 0;
  if (settings.insertHeader) {
    for (let i = 0; i < fmt.timeFieldCount; i++) {
      fieldWidths[i] = labels[i].length;
    }
    if (fmt.hasUser) {
      userWidth = "user".length;
    }
  }
  let bodyW = 0;
  let redirW = 0;
  for (const c of cronLines) {
    for (let i = 0; i < fmt.timeFieldCount; i++) {
      fieldWidths[i] = Math.max(fieldWidths[i], c.fields[i].length);
    }
    if (fmt.hasUser && c.user) {
      userWidth = Math.max(userWidth, c.user.length);
    }
    if (alignTail) {
      const { body, redirect } = splitTail(c.command, settings);
      bodyW = Math.max(bodyW, body.length);
      if (redirect !== null) {
        redirW = Math.max(redirW, redirect.length);
      }
    }
  }

  const macroWidth = settings.formatMacros
    ? macroLines.reduce((w, m) => Math.max(w, m.macro.length), 0)
    : 0;

  const envWidth = settings.alignEnvEquals
    ? doc.lines.reduce(
        (w, l) => (l.kind === "env" ? Math.max(w, l.key.length) : w),
        0
      )
    : 0;

  const out = doc.lines.map((line) => {
    switch (line.kind) {
      case "empty":
        return "";
      case "comment":
      case "unknown":
        return (lead(line.indent) + line.raw.slice(line.indent.length)).replace(
          /\s+$/,
          ""
        );
      case "env": {
        if (!settings.alignEnvEquals) {
          return (
            lead(line.indent) + line.raw.slice(line.indent.length)
          ).replace(/\s+$/, "");
        }
        const value = line.value.replace(/^\s+/, "");
        return (
          lead(line.indent) + line.key.padEnd(envWidth) + " = " + value
        ).replace(/\s+$/, "");
      }
      case "macro": {
        if (!settings.formatMacros || line.remainder === "") {
          return (
            lead(line.indent) + line.raw.slice(line.indent.length)
          ).replace(/\s+$/, "");
        }
        return (
          lead(line.indent) + line.macro.padEnd(macroWidth) + sep + line.remainder
        ).replace(/\s+$/, "");
      }
      case "cron": {
        if (!line.complete) {
          return (
            lead(line.indent) + line.raw.slice(line.indent.length)
          ).replace(/\s+$/, "");
        }
        const cols = line.fields
          .map((f, i) => f.padEnd(fieldWidths[i]))
          .join(sep);
        let head = lead(line.indent) + cols;
        if (fmt.hasUser) {
          head += sep + (line.user ?? "").padEnd(userWidth);
        }

        if (!alignTail) {
          return (head + sep + line.command).replace(/\s+$/, "");
        }

        const { body, redirect, comment } = splitTail(line.command, settings);
        const parts: string[] = [body.padEnd(bodyW)];
        if (settings.alignRedirects) {
          parts.push(
            settings.alignComments ? (redirect ?? "").padEnd(redirW) : redirect ?? ""
          );
        }
        if (settings.alignComments) {
          parts.push(comment ?? "");
        }
        return (head + sep + parts.join(sep)).replace(/\s+$/, "");
      }
    }
  });

  // Insert the header reminder at the very top, if requested and not present.
  if (settings.insertHeader && cronLines.length > 0) {
    const firstContent = doc.lines.find((l) => l.kind !== "empty");
    const headerPresent =
      !!firstContent &&
      firstContent.kind === "comment" &&
      /min/i.test(firstContent.raw) &&
      /command/i.test(firstContent.raw);
    if (!headerPresent) {
      const headParts = labels.map((l, i) => l.padEnd(fieldWidths[i]));
      let header = "# " + headParts.join(sep);
      if (fmt.hasUser) {
        header += sep + "user".padEnd(userWidth);
      }
      header = (header + sep + "command").replace(/\s+$/, "");
      out.unshift(header);
    }
  }

  return out.join(doc.eol) + (doc.trailingNewline ? doc.eol : "");
}
