/**
 * Shared types for the crontab formatter. No dependency on the VS Code API so
 * the whole core (parser/formatter/validator/explainer) stays unit-testable.
 */

export type ModeSetting = "auto" | "user" | "system";
export type TriSetting = "auto" | "true" | "false";
export type Locale = "ru" | "en";

export interface FormatterSettings {
  mode: ModeSetting;
  secondsField: TriSetting;
  yearField: TriSetting;
  alignComments: boolean;
  alignRedirects: boolean;
  alignEnvEquals: boolean;
  insertHeader: boolean;
  preserveIndentation: boolean;
  minSpacesBetweenColumns: number;
  formatMacros: boolean;
}

export const DEFAULT_SETTINGS: FormatterSettings = {
  mode: "auto",
  secondsField: "auto",
  yearField: "auto",
  alignComments: false,
  alignRedirects: false,
  alignEnvEquals: false,
  insertHeader: false,
  preserveIndentation: false,
  minSpacesBetweenColumns: 2,
  formatMacros: true,
};

/** Field layout resolved for the whole document. */
export interface ResolvedFormat {
  hasUser: boolean;
  secondsEnabled: boolean;
  yearEnabled: boolean;
  /** Number of leading time fields (5, 6, or 7). */
  timeFieldCount: number;
}

export type LineKind = "empty" | "comment" | "env" | "macro" | "cron" | "unknown";

export interface BaseLine {
  kind: LineKind;
  raw: string;
  indent: string;
  lineNumber: number; // 0-based
}

export interface EmptyLine extends BaseLine {
  kind: "empty";
}

export interface CommentLine extends BaseLine {
  kind: "comment";
}

export interface UnknownLine extends BaseLine {
  kind: "unknown";
}

export interface EnvLine extends BaseLine {
  kind: "env";
  key: string;
  /** Raw value, untouched (may contain spaces / quotes). */
  value: string;
}

export interface MacroLine extends BaseLine {
  kind: "macro";
  macro: string; // e.g. "@reboot"
  /** Everything after the macro, raw (may include user + command). */
  remainder: string;
}

export interface CronLine extends BaseLine {
  kind: "cron";
  /** Time fields actually captured. */
  fields: string[];
  /** System-mode user, only when a valid username was found. */
  user?: string;
  /** Raw command remainder, left-trimmed only. */
  command: string;
  /** True when all N time fields were captured and are syntactically valid. */
  complete: boolean;
  /** True in system mode when no valid user token was present. */
  missingUser?: boolean;
}

export type ParsedLine =
  | EmptyLine
  | CommentLine
  | UnknownLine
  | EnvLine
  | MacroLine
  | CronLine;

export interface ParsedDocument {
  lines: ParsedLine[];
  eol: "\n" | "\r\n";
  trailingNewline: boolean;
  format: ResolvedFormat;
}

export type Severity = "error" | "warning" | "info";

export interface Diagnostic {
  line: number; // 0-based
  startCol: number;
  endCol: number;
  message: string;
  severity: Severity;
  code?: string;
}

export interface FieldMeta {
  name: string;
  min: number;
  max: number;
  /** Name aliases (e.g. jan->1, sun->0) recognised for this field. */
  names?: Record<string, number>;
}

export const MACROS: Record<string, string | null> = {
  "@reboot": null, // no schedule expression
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};
