import * as vscode from "vscode";
import { FormatterSettings, Locale } from "./types";
import { parseDocument, resolveFormat, splitLeadingTokens } from "./parser";
import { hasTopLevelRedirect, hasTopLevelStderrRedirect } from "./formatter";
import { t } from "./i18n";

/**
 * Safe quick fixes. None of these change the *schedule* automatically — the
 * schedule-to-macro conversion is offered only as an explicit, user-confirmed
 * action. The formatter itself never alters meaning.
 */

const SCHEDULE_MACROS: { expr: string; macro: string }[] = [
  { expr: "0 * * * *", macro: "@hourly" },
  { expr: "0 0 * * *", macro: "@daily" },
  { expr: "0 0 * * 0", macro: "@weekly" },
  { expr: "0 0 1 * *", macro: "@monthly" },
  { expr: "0 0 1 1 *", macro: "@yearly" },
];

function scriptBaseName(command: string): string {
  const first = splitLeadingTokens(command, 1).tokens[0] ?? "";
  const base = first.split("/").pop() ?? "";
  const name = base.replace(/\.[^.]+$/, "");
  return name || "cron";
}

export class CrontabCodeActionProvider implements vscode.CodeActionProvider {
  static readonly kinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.RefactorRewrite,
  ];

  constructor(
    private readonly getSettings: (doc: vscode.TextDocument) => FormatterSettings,
    private readonly getLocale: (doc: vscode.TextDocument) => Locale
  ) {}

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.CodeAction[] {
    const settings = this.getSettings(document);
    const locale = this.getLocale(document);
    const fmt = resolveFormat(document.getText(), document.fileName, settings);
    const doc = parseDocument(document.getText(), fmt);
    const lineIndex = range.start.line;
    const parsed = doc.lines[lineIndex];
    if (!parsed) {
      return [];
    }

    const actions: vscode.CodeAction[] = [];
    const textLine = document.lineAt(lineIndex);
    const eolPos = textLine.range.end;

    // The command/remainder is always a suffix of the raw line.
    let command: string | undefined;
    let commandStart: number | undefined;
    if (parsed.kind === "cron" && parsed.complete) {
      command = parsed.command;
      commandStart = parsed.raw.length - parsed.command.length;
    } else if (parsed.kind === "macro") {
      command = parsed.remainder;
      commandStart = parsed.raw.length - parsed.remainder.length;
    }

    if (command !== undefined && command.trim() !== "") {
      const hasRedirect = hasTopLevelRedirect(command);
      const hasStderr = hasTopLevelStderrRedirect(command);

      if (!hasRedirect) {
        actions.push(
          this.appendAction(document, eolPos, " >/dev/null 2>&1", t(locale, "action.devnull"))
        );
        actions.push(
          this.appendAction(
            document,
            eolPos,
            ` >>/var/log/${scriptBaseName(command)}.log 2>&1`,
            t(locale, "action.log", scriptBaseName(command))
          )
        );
      } else if (!hasStderr) {
        // stdout is redirected but stderr is not — offer to append 2>&1.
        actions.push(
          this.appendAction(document, eolPos, " 2>&1", t(locale, "action.stderr"))
        );
      }

      // Insert absolute php path when the command starts with bare `php`.
      if (commandStart !== undefined && /^php(\s|$)/.test(command)) {
        const start = document.positionAt(
          document.offsetAt(new vscode.Position(lineIndex, 0)) +
            commandStart
        );
        const phpRange = new vscode.Range(
          start,
          start.translate(0, 3)
        );
        const action = new vscode.CodeAction(
          t(locale, "action.php"),
          vscode.CodeActionKind.QuickFix
        );
        action.edit = new vscode.WorkspaceEdit();
        action.edit.replace(document.uri, phpRange, "/usr/bin/php");
        actions.push(action);
      }
    }

    // Explain schedule (delegates to the command).
    if (
      (parsed.kind === "cron" && parsed.complete) ||
      parsed.kind === "macro"
    ) {
      const explain = new vscode.CodeAction(
        t(locale, "action.explain"),
        vscode.CodeActionKind.QuickFix
      );
      explain.command = {
        command: "crontab.explainLine",
        title: t(locale, "action.explain"),
        arguments: [lineIndex],
      };
      actions.push(explain);
    }

    // Convert exact 5-field schedule to an equivalent macro (explicit only).
    if (
      parsed.kind === "cron" &&
      parsed.complete &&
      fmt.timeFieldCount === 5
    ) {
      const expr = parsed.fields.join(" ");
      const match = SCHEDULE_MACROS.find((m) => m.expr === expr);
      if (match) {
        const rest =
          (parsed.user ? parsed.user + " " : "") + parsed.command;
        const newLine =
          (settings.preserveIndentation ? parsed.indent : "") +
          match.macro +
          " " +
          rest;
        const action = new vscode.CodeAction(
          t(locale, "action.convert", match.macro),
          vscode.CodeActionKind.RefactorRewrite
        );
        action.edit = new vscode.WorkspaceEdit();
        action.edit.replace(document.uri, textLine.range, newLine.replace(/\s+$/, ""));
        actions.push(action);
      }
    }

    return actions;
  }

  private appendAction(
    document: vscode.TextDocument,
    at: vscode.Position,
    text: string,
    title: string
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
    action.edit = new vscode.WorkspaceEdit();
    action.edit.insert(document.uri, at, text);
    return action;
  }
}
