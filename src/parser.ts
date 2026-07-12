/**
 * Line-by-line crontab parser. The command portion of a line is never
 * tokenised — it is taken as a raw substring so quotes, pipes, redirects,
 * &&, $(...), backticks and inline # all survive untouched.
 */

import {
  FormatterSettings,
  ParsedDocument,
  ParsedLine,
  ResolvedFormat,
} from "./types";
import { fieldSyntaxOk, getFieldMetas } from "./fields";

const ENV_RE = /^[A-Za-z_][A-Za-z0-9_]*\s*=/;
const USERNAME_RE = /^[a-z_][-a-z0-9_]*\$?$/i;

// Common command names that also parse as usernames. Used only to bias the
// content-based user/system heuristic towards *user* mode when the token after
// the schedule is really a command, not a system user. Names that are plausible
// system users (root, www-data, mysql, postgres, nobody, …) are deliberately
// absent — those stay ambiguous and are resolved by the surrounding heuristic.
const COMMON_COMMANDS = new Set([
  "sh", "bash", "zsh", "dash", "python", "python2", "python3", "perl", "ruby",
  "node", "php", "curl", "wget", "echo", "printf", "date", "find", "sync",
  "sleep", "cat", "cp", "mv", "rm", "mkdir", "touch", "tar", "gzip", "rsync",
  "ssh", "scp", "git", "make", "npm", "npx", "yarn", "pnpm", "test", "flock",
  "logger", "sed", "awk", "grep", "true", "false",
]);

export function isUsername(token: string): boolean {
  return token.length <= 32 && USERNAME_RE.test(token);
}

export function isMacroToken(token: string): boolean {
  return token.startsWith("@");
}

/**
 * Consume up to `n` whitespace-separated tokens from the start of `s`.
 * Returns the tokens and `rest` — the original string starting at the first
 * non-whitespace char after the consumed tokens (internal spacing preserved).
 */
export function splitLeadingTokens(
  s: string,
  n: number
): { tokens: string[]; rest: string } {
  const tokens: string[] = [];
  let i = 0;
  while (tokens.length < n) {
    while (i < s.length && /\s/.test(s[i])) {
      i++;
    }
    if (i >= s.length) {
      break;
    }
    const start = i;
    while (i < s.length && !/\s/.test(s[i])) {
      i++;
    }
    tokens.push(s.slice(start, i));
  }
  while (i < s.length && /\s/.test(s[i])) {
    i++;
  }
  return { tokens, rest: s.slice(i) };
}

function detectEol(text: string): "\n" | "\r\n" {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

const SYSTEM_FILENAME_RE =
  /(^|[\\/])etc[\\/]crontab$|(^|[\\/])cron\.d(?=[\\/]|$)|(^|[\\/])etc_crontab(?=[\\/]|$)|(^|[\\/])crontab\.system(?=[\\/]|$)/i;

function autoDetectUser(
  text: string,
  filename: string,
  timeFieldCount: number
): boolean {
  if (filename && SYSTEM_FILENAME_RE.test(filename.replace(/\\/g, "/"))) {
    return true;
  }
  // Content heuristic: count cron-ish lines whose token after the time fields
  // looks like a username with a command following it.
  let systemish = 0;
  let total = 0;
  for (const raw of text.split(/\r\n|\n|\r/)) {
    const content = raw.replace(/^[ \t]+/, "");
    if (
      content === "" ||
      content.startsWith("#") ||
      content.startsWith("@") ||
      ENV_RE.test(content)
    ) {
      continue;
    }
    const { tokens, rest } = splitLeadingTokens(content, timeFieldCount);
    if (tokens.length < timeFieldCount) {
      continue;
    }
    total++;
    const peek = splitLeadingTokens(rest, 1);
    const candidate = peek.tokens[0] ?? "";
    if (
      peek.tokens.length === 1 &&
      isUsername(candidate) &&
      peek.rest.trim() !== "" &&
      // A real system-user token is followed by a command, not by a flag,
      // redirect or pipe (those mean the "user" is actually the command); and
      // it is not an obvious command name.
      !/^[-<>|]/.test(peek.rest.replace(/^\s+/, "")) &&
      !COMMON_COMMANDS.has(candidate.toLowerCase())
    ) {
      systemish++;
    }
  }
  return total >= 2 && systemish / total >= 0.6;
}

export function resolveFormat(
  text: string,
  filename: string,
  s: FormatterSettings
): ResolvedFormat {
  const secondsEnabled = s.secondsField === "true";
  const yearEnabled = s.yearField === "true";
  const timeFieldCount = 5 + (secondsEnabled ? 1 : 0) + (yearEnabled ? 1 : 0);

  let hasUser: boolean;
  if (s.mode === "user") {
    hasUser = false;
  } else if (s.mode === "system") {
    hasUser = true;
  } else {
    hasUser = autoDetectUser(text, filename, timeFieldCount);
  }

  return { hasUser, secondsEnabled, yearEnabled, timeFieldCount };
}

function parseLine(
  raw: string,
  lineNumber: number,
  fmt: ResolvedFormat
): ParsedLine {
  const indent = raw.match(/^[ \t]*/)![0];
  const content = raw.slice(indent.length);

  if (content.trim() === "") {
    return { kind: "empty", raw, indent, lineNumber };
  }
  if (content.startsWith("#")) {
    return { kind: "comment", raw, indent, lineNumber };
  }
  if (ENV_RE.test(content)) {
    const eq = content.indexOf("=");
    return {
      kind: "env",
      raw,
      indent,
      lineNumber,
      key: content.slice(0, eq).trimEnd(),
      value: content.slice(eq + 1),
    };
  }

  const firstToken = content.match(/^\S+/)![0];
  if (isMacroToken(firstToken)) {
    const { rest } = splitLeadingTokens(content, 1);
    return {
      kind: "macro",
      raw,
      indent,
      lineNumber,
      macro: firstToken,
      remainder: rest,
    };
  }

  const metas = getFieldMetas(fmt);
  const { tokens, rest } = splitLeadingTokens(content, fmt.timeFieldCount);

  const complete =
    tokens.length === fmt.timeFieldCount &&
    tokens.every((t, i) => fieldSyntaxOk(t, metas[i]));

  if (!complete) {
    return {
      kind: "cron",
      raw,
      indent,
      lineNumber,
      fields: tokens,
      command: rest,
      complete: false,
    };
  }

  let user: string | undefined;
  let command = rest;
  let missingUser = false;
  if (fmt.hasUser) {
    const peek = splitLeadingTokens(rest, 1);
    if (peek.tokens.length === 1 && isUsername(peek.tokens[0])) {
      user = peek.tokens[0];
      command = peek.rest;
    } else {
      missingUser = true;
    }
  }

  return {
    kind: "cron",
    raw,
    indent,
    lineNumber,
    fields: tokens,
    user,
    command,
    complete: true,
    missingUser,
  };
}

export function parseDocument(
  text: string,
  fmt: ResolvedFormat
): ParsedDocument {
  const eol = detectEol(text);
  const trailingNewline = /\r?\n$/.test(text);
  const rawLines = text.split(/\r\n|\n|\r/);
  if (trailingNewline) {
    rawLines.pop();
  }
  const lines = rawLines.map((raw, i) => parseLine(raw, i, fmt));
  return { lines, eol, trailingNewline, format: fmt };
}
