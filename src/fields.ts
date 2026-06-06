/**
 * Cron field metadata + syntax/range analysis.
 *
 * Shared by the parser (to decide whether a line is a real, formattable cron
 * entry) and by the validator (to produce soft diagnostics). Keeping it in one
 * place guarantees the two agree on what a valid field looks like.
 */

import { FieldMeta, ResolvedFormat, Severity } from "./types";

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const DOW_NAMES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

const SECOND: FieldMeta = { name: "second", min: 0, max: 59 };
const MINUTE: FieldMeta = { name: "minute", min: 0, max: 59 };
const HOUR: FieldMeta = { name: "hour", min: 0, max: 23 };
const DOM: FieldMeta = { name: "day-of-month", min: 1, max: 31 };
const MONTH: FieldMeta = { name: "month", min: 1, max: 12, names: MONTH_NAMES };
// day-of-week allows 0-7 (both 0 and 7 = Sunday).
const DOW: FieldMeta = { name: "day-of-week", min: 0, max: 7, names: DOW_NAMES };
const YEAR: FieldMeta = { name: "year", min: 1970, max: 2099 };

/** Returns the ordered field metadata for the resolved layout. */
export function getFieldMetas(fmt: ResolvedFormat): FieldMeta[] {
  const metas: FieldMeta[] = [];
  if (fmt.secondsEnabled) {
    metas.push(SECOND);
  }
  metas.push(MINUTE, HOUR, DOM, MONTH, DOW);
  if (fmt.yearEnabled) {
    metas.push(YEAR);
  }
  return metas;
}

function valueNumber(v: string, meta: FieldMeta): number | null {
  if (/^\d+$/.test(v)) {
    return parseInt(v, 10);
  }
  if (meta.names) {
    const n = meta.names[v.toLowerCase()];
    if (n !== undefined) {
      return n;
    }
  }
  return null;
}

function valueSyntaxOk(v: string, meta: FieldMeta): boolean {
  return valueNumber(v, meta) !== null;
}

interface ElementParts {
  star: boolean;
  rangeStart?: string;
  rangeEnd?: string;
  step?: string;
}

/** Parse one comma element into structure; returns null on a syntax error. */
function parseElement(el: string, meta: FieldMeta): ElementParts | null {
  const slash = el.split("/");
  if (slash.length > 2) {
    return null;
  }
  const step = slash.length === 2 ? slash[1] : undefined;
  if (step !== undefined && !/^\d+$/.test(step)) {
    return null;
  }
  const main = slash[0];
  if (main === "*") {
    return { star: true, step };
  }
  const range = main.split("-");
  if (range.length > 2 || range.some((r) => r === "")) {
    return null;
  }
  if (!range.every((r) => valueSyntaxOk(r, meta))) {
    return null;
  }
  return {
    star: false,
    rangeStart: range[0],
    rangeEnd: range.length === 2 ? range[1] : undefined,
    step,
  };
}

/** True if the token is syntactically a valid cron field for this position. */
export function fieldSyntaxOk(token: string, meta: FieldMeta): boolean {
  const elements = token.split(",");
  if (elements.some((e) => e === "")) {
    return false;
  }
  return elements.every((e) => parseElement(e, meta) !== null);
}

export interface FieldIssue {
  code: "field-syntax" | "zero-step" | "out-of-range" | "reversed-range";
  severity: Severity;
  field: string; // meta.name id, localized by the caller
  min?: number;
  max?: number;
  el?: string;
  value?: string;
  a?: string;
  b?: string;
}

/** Soft analysis of a single field; returns structured issues without throwing. */
export function analyzeField(token: string, meta: FieldMeta): FieldIssue[] {
  const issues: FieldIssue[] = [];
  for (const el of token.split(",")) {
    const parts = parseElement(el, meta);
    if (!parts) {
      issues.push({ code: "field-syntax", severity: "warning", field: meta.name, el });
      continue;
    }
    if (parts.step !== undefined && parseInt(parts.step, 10) === 0) {
      issues.push({ code: "zero-step", severity: "warning", field: meta.name });
    }
    const checkRange = (raw: string) => {
      const n = valueNumber(raw, meta);
      if (n === null) {
        return;
      }
      if (n < meta.min || n > meta.max) {
        issues.push({
          code: "out-of-range",
          severity: "warning",
          field: meta.name,
          value: raw,
          min: meta.min,
          max: meta.max,
        });
      }
    };
    if (!parts.star && parts.rangeStart !== undefined) {
      checkRange(parts.rangeStart);
      if (parts.rangeEnd !== undefined) {
        checkRange(parts.rangeEnd);
        const a = valueNumber(parts.rangeStart, meta);
        const b = valueNumber(parts.rangeEnd, meta);
        if (a !== null && b !== null && a > b) {
          issues.push({
            code: "reversed-range",
            severity: "info",
            field: meta.name,
            a: parts.rangeStart,
            b: parts.rangeEnd,
          });
        }
      }
    }
  }
  return issues;
}
