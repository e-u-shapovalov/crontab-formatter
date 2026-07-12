/**
 * Human-readable explanation of a single crontab line via cronstrue.
 * Only time fields are passed to cronstrue (user and year are dropped).
 */

// cronstrue v2 i18n build: supports the `locale` option (incl. "ru").
import cronstrue from "cronstrue/i18n";

import { FormatterSettings, Locale, MACROS } from "./types";
import { resolveFormat, parseDocument } from "./parser";
import { getFieldMetas, analyzeField } from "./fields";
import { t } from "./i18n";

function explainExpression(expr: string, locale: Locale): string | null {
  try {
    return cronstrue.toString(expr, {
      locale,
      throwExceptionOnParseError: true,
      use24HourTimeFormat: true,
    });
  } catch {
    return null;
  }
}

export function explainLine(
  text: string,
  lineNumber: number,
  settings: FormatterSettings,
  locale: Locale,
  filename?: string
): string | null {
  const fmt = resolveFormat(text, filename ?? "", settings);
  const doc = parseDocument(text, fmt);
  const line = doc.lines[lineNumber];
  if (!line) {
    return null;
  }

  if (line.kind === "macro") {
    const macro = line.macro.toLowerCase();
    if (macro === "@reboot") {
      return t(locale, "msg.reboot");
    }
    const expr = MACROS[macro];
    if (expr) {
      return explainExpression(expr, locale);
    }
    return null;
  }

  if (line.kind === "cron" && line.complete) {
    const metas = getFieldMetas(fmt);
    // Don't offer an explanation for a schedule the validator rejects as having a
    // zero step — cronstrue would otherwise render a meaningless "every 0 …".
    for (let i = 0; i < metas.length; i++) {
      if (analyzeField(line.fields[i], metas[i]).some((x) => x.code === "zero-step")) {
        return null;
      }
    }
    const parts = line.fields.slice(0, metas.length);
    // cronstrue reads a 6-field expression as seconds-first; when the layout has
    // a year but no seconds, prepend a 0-seconds field so the trailing value is
    // unambiguously the year (7 fields).
    if (fmt.yearEnabled && !fmt.secondsEnabled) {
      parts.unshift("0");
    }
    return explainExpression(parts.join(" "), locale);
  }

  return null;
}
