/**
 * Human-readable explanation of a single crontab line via cronstrue.
 * Only time fields are passed to cronstrue (user and year are dropped).
 */

// cronstrue v2 i18n build: supports the `locale` option (incl. "ru").
import cronstrue from "cronstrue/i18n";

import { FormatterSettings, Locale, MACROS } from "./types";
import { resolveFormat, parseDocument } from "./parser";
import { getFieldMetas } from "./fields";
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
    // Build the 5 core fields (minute,hour,dom,month,dow), optionally prefixed
    // with seconds. Year is never included.
    const parts: string[] = [];
    for (let i = 0; i < metas.length; i++) {
      if (metas[i].name === "year") {
        continue;
      }
      parts.push(line.fields[i]);
    }
    const expr = parts.join(" ");
    return explainExpression(expr, locale);
  }

  return null;
}
