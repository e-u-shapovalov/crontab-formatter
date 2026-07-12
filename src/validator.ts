/**
 * Soft validation of a crontab document. Produces non-fatal diagnostics
 * (mostly warnings/info hints) — it never throws and never blocks formatting.
 */

import { Diagnostic, FormatterSettings, Locale, MACROS } from "./types";
import {
  resolveFormat,
  parseDocument,
  splitLeadingTokens,
  isUsername,
} from "./parser";
import { getFieldMetas, analyzeField } from "./fields";
import { maskNonTopLevel, detectTrailingComment } from "./formatter";
import { fieldName, t } from "./i18n";

interface RedirectInfo {
  hasOut: boolean;
  hasErr: boolean;
  bad: string | null;
}

function analyzeRedirects(command: string): RedirectInfo {
  const code = maskNonTopLevel(command);
  const badMatch = code.match(/>\s*\d+\s*&\s*\d*/);
  return {
    hasOut: code.includes(">"),
    hasErr: /2>|&>|>&/.test(code),
    bad: badMatch ? badMatch[0].trim() : null,
  };
}

export function validateDocument(
  text: string,
  settings: FormatterSettings,
  filename?: string,
  locale: Locale = "ru"
): Diagnostic[] {
  const diags: Diagnostic[] = [];
  if (text === "") {
    return diags;
  }

  const fmt = resolveFormat(text, filename ?? "", settings);
  const doc = parseDocument(text, fmt);
  const metas = getFieldMetas(fmt);

  for (const line of doc.lines) {
    const startCol = line.indent.length;
    const endCol = line.raw.length;
    const push = (message: string, severity: Diagnostic["severity"], code: string) =>
      diags.push({ line: line.lineNumber, startCol, endCol, message, severity, code });

    // Shared command-quality hints (cron + macro). A trailing shell comment is
    // not part of the executable command, so redirect checks look only at the
    // code before it.
    const commandHints = (cmd: string) => {
      const tc = detectTrailingComment(cmd);
      const code = tc ? tc.code : cmd;
      if (code.trim() === "") {
        return;
      }
      const r = analyzeRedirects(code);
      if (r.bad) {
        push(t(locale, "bad-redirect", r.bad), "warning", "bad-redirect");
      }
      if (!r.hasOut) {
        push(t(locale, "no-redirect"), "info", "no-redirect");
      } else if (!r.hasErr) {
        push(t(locale, "stderr-not-redirected"), "info", "stderr-not-redirected");
      }
    };

    if (line.kind === "cron") {
      if (!line.complete) {
        if (line.fields.length >= 1) {
          push(t(locale, "few-fields", fmt.timeFieldCount), "warning", "few-fields");
        }
        continue;
      }

      if (fmt.hasUser && line.missingUser === true) {
        push(t(locale, "missing-user"), "warning", "missing-user");
      }

      if (line.command.trim() === "") {
        push(t(locale, "empty-command"), "warning", "empty-command");
      }

      line.fields.forEach((token, i) => {
        const meta = metas[i];
        if (!meta) {
          return;
        }
        for (const issue of analyzeField(token, meta)) {
          const fname = fieldName(locale, issue.field);
          let message: string;
          switch (issue.code) {
            case "field-syntax":
              message = t(locale, "field-syntax", issue.el, fname);
              break;
            case "zero-step":
              message = t(locale, "zero-step", fname);
              break;
            case "out-of-range":
              message = t(locale, "out-of-range", issue.value, fname, issue.min, issue.max);
              break;
            case "reversed-range":
              message = t(locale, "reversed-range", issue.a, issue.b, fname);
              break;
          }
          push(message, issue.severity, issue.code);
        }
      });

      commandHints(line.command);
    } else if (line.kind === "macro") {
      if (!(line.macro.toLowerCase() in MACROS)) {
        push(t(locale, "unknown-macro", line.macro), "warning", "unknown-macro");
      }
      let cmd = line.remainder;
      if (fmt.hasUser) {
        const peek = splitLeadingTokens(line.remainder, 1);
        if (peek.tokens.length === 1 && isUsername(peek.tokens[0])) {
          cmd = peek.rest;
        }
      }
      commandHints(cmd);
    }
  }

  return diags;
}
