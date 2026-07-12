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
 * Blank out every character that lives inside single/double quotes, backticks,
 * a `$(...)` command substitution or a `<(...)`/`>(...)` process substitution,
 * preserving length. A backslash escapes the next character (except inside
 * single quotes, where nothing is special), so `\"`, `\>` and `\#` are treated
 * as literals rather than opening a quote or a redirect/comment. Callers scan
 * the mask for a *top-level* `>` or `#` and slice the original string at the
 * same index, so a redirect or `#` hidden inside a command is never split off.
 */
export function maskNonTopLevel(s: string): string {
  let out = "";
  let inS = false;
  let inD = false;
  let inB = false;
  let depth = 0; // $( / <( / >( nesting
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    // Single quotes are fully literal — no escaping, no nesting.
    if (inS) {
      out += " ";
      if (c === "'") inS = false;
      continue;
    }
    // A backslash escapes the following character everywhere else; mask both so
    // the escaped char can never act as a delimiter.
    if (c === "\\") {
      out += " ";
      if (i + 1 < s.length) {
        out += " ";
        i++;
      }
      continue;
    }
    if (inD) {
      out += " ";
      if (c === '"') inD = false;
      continue;
    }
    if (inB) {
      out += " ";
      if (c === "`") inB = false;
      continue;
    }
    if (c === "'") { inS = true; out += " "; continue; }
    if (c === '"') { inD = true; out += " "; continue; }
    if (c === "`") { inB = true; out += " "; continue; }
    // Command / process substitution: `$(`, `<(`, `>(`.
    if ((c === "$" || c === "<" || c === ">") && s[i + 1] === "(") {
      depth++;
      out += "  "; // blank both the leading char and `(`
      i++;
      continue;
    }
    if (depth > 0) {
      if (c === "(") depth++;
      else if (c === ")") depth--;
      out += " ";
      continue;
    }
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
  const i = maskNonTopLevel(code).indexOf(">");
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
  const badMatch = code.match(/>\s*\d+\s*&\s*\d*/);
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
    } else if (m[0].includes(">")) {
      if (m[0].includes("&")) {
        // `&>`, `&>>`, `>&file` — both streams to a file.
        fd1 = true;
        fd2 = true;
      } else {
        const fd = !m[3] ? 1 : parseInt(m[3], 10);
        if (fd === 1) fd1 = true;
        else if (fd === 2) fd2 = true;
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
