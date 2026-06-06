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
 * Detect a trailing inline comment that is safe to split off (a `#` outside any
 * quotes/backticks, preceded by whitespace). Returns null when none is found.
 */
export function detectTrailingComment(
  cmd: string
): { code: string; comment: string } | null {
  let inS = false;
  let inD = false;
  let inB = false;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (inS) {
      if (c === "'") inS = false;
      continue;
    }
    if (inD) {
      if (c === '"' && cmd[i - 1] !== "\\") inD = false;
      continue;
    }
    if (inB) {
      if (c === "`") inB = false;
      continue;
    }
    if (c === "'") { inS = true; continue; }
    if (c === '"') { inD = true; continue; }
    if (c === "`") { inB = true; continue; }
    if (c === "#" && i > 0 && /\s/.test(cmd[i - 1])) {
      return { code: cmd.slice(0, i).replace(/\s+$/, ""), comment: cmd.slice(i) };
    }
  }
  return null;
}

/**
 * Split a command at its first top-level (unquoted) output redirection, so the
 * redirect tail can be aligned into its own column. fd digits and `&` directly
 * preceding `>` are kept with the redirect (e.g. `2>&1`, `&>file`).
 */
export function detectRedirect(
  code: string
): { body: string; redirect: string } | null {
  let inS = false;
  let inD = false;
  let inB = false;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (inS) {
      if (c === "'") inS = false;
      continue;
    }
    if (inD) {
      if (c === '"' && code[i - 1] !== "\\") inD = false;
      continue;
    }
    if (inB) {
      if (c === "`") inB = false;
      continue;
    }
    if (c === "'") { inS = true; continue; }
    if (c === '"') { inD = true; continue; }
    if (c === "`") { inB = true; continue; }
    if (c === ">") {
      let start = i;
      while (start > 0) {
        const p = code[start - 1];
        if (p === "&" || /[0-9]/.test(p)) start--;
        else break;
      }
      const body = code.slice(0, start).replace(/\s+$/, "");
      if (body === "") {
        return null;
      }
      return { body, redirect: code.slice(start).replace(/\s+$/, "") };
    }
  }
  return null;
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
