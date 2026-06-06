import * as vscode from "vscode";
import { FormatterSettings, Locale, Severity } from "./types";
import { formatDocument } from "./formatter";
import { validateDocument } from "./validator";
import { explainLine } from "./explainer";
import { parseDocument, resolveFormat } from "./parser";
import { CrontabCodeActionProvider } from "./codeActions";
import { t } from "./i18n";

const SELECTOR: vscode.DocumentSelector = [
  { language: "crontab" },
  { language: "cron" },
];

function readSettings(document: vscode.TextDocument): FormatterSettings {
  const c = vscode.workspace.getConfiguration("crontabFormatter", document.uri);
  return {
    mode: c.get("mode", "auto"),
    secondsField: c.get("secondsField", "auto"),
    yearField: c.get("yearField", "auto"),
    alignComments: c.get("alignComments", false),
    alignRedirects: c.get("alignRedirects", false),
    alignEnvEquals: c.get("alignEnvEquals", false),
    insertHeader: c.get("insertHeader", false),
    preserveIndentation: c.get("preserveIndentation", false),
    minSpacesBetweenColumns: c.get("minSpacesBetweenColumns", 2),
    formatMacros: c.get("formatMacros", true),
  };
}

function readLocale(document: vscode.TextDocument): Locale {
  const c = vscode.workspace.getConfiguration("crontabFormatter", document.uri);
  const v = c.get<string>("locale", "ru");
  if (v === "ru" || v === "en") {
    return v;
  }
  return vscode.env.language.toLowerCase().startsWith("ru") ? "ru" : "en";
}

function fullRange(document: vscode.TextDocument): vscode.Range {
  return new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length)
  );
}

function severityToVs(s: Severity): vscode.DiagnosticSeverity {
  switch (s) {
    case "error":
      return vscode.DiagnosticSeverity.Error;
    case "warning":
      return vscode.DiagnosticSeverity.Warning;
    default:
      return vscode.DiagnosticSeverity.Information;
  }
}

function isCrontab(document: vscode.TextDocument): boolean {
  return document.languageId === "crontab" || document.languageId === "cron";
}

export function activate(context: vscode.ExtensionContext) {
  // --- Formatting: whole document ---
  const formattingProvider: vscode.DocumentFormattingEditProvider = {
    provideDocumentFormattingEdits(document) {
      const formatted = formatDocument(
        document.getText(),
        readSettings(document),
        document.fileName
      );
      return [vscode.TextEdit.replace(fullRange(document), formatted)];
    },
  };

  // --- Formatting: selection (columns still computed over the whole file) ---
  const rangeProvider: vscode.DocumentRangeFormattingEditProvider = {
    provideDocumentRangeFormattingEdits(document, range) {
      const formatted = formatDocument(
        document.getText(),
        readSettings(document),
        document.fileName
      );
      const eol = document.getText().includes("\r\n") ? "\r\n" : "\n";
      const formattedLines = formatted.split(eol);
      const edits: vscode.TextEdit[] = [];
      // Header insertion can add a line; only safe to map 1:1 when counts match.
      if (formattedLines.length !== document.lineCount) {
        return [vscode.TextEdit.replace(fullRange(document), formatted)];
      }
      for (let i = range.start.line; i <= range.end.line; i++) {
        if (i >= document.lineCount) {
          break;
        }
        const lineRange = document.lineAt(i).range;
        if (document.getText(lineRange) !== formattedLines[i]) {
          edits.push(vscode.TextEdit.replace(lineRange, formattedLines[i]));
        }
      }
      return edits;
    },
  };

  // --- Hover: schedule explanation ---
  const hoverProvider: vscode.HoverProvider = {
    provideHover(document, position) {
      const c = vscode.workspace.getConfiguration(
        "crontabFormatter",
        document.uri
      );
      if (!c.get("explainHover", true)) {
        return undefined;
      }
      const locale = readLocale(document);
      const explanation = explainLine(
        document.getText(),
        position.line,
        readSettings(document),
        locale,
        document.fileName
      );
      if (!explanation) {
        return undefined;
      }
      const md = new vscode.MarkdownString();
      md.appendMarkdown(`**${t(locale, "hover.label")}:** ${explanation}`);
      return new vscode.Hover(md, document.lineAt(position.line).range);
    },
  };

  // --- Completion: typing `*` offers to fill the whole schedule line ---
  const completionProvider: vscode.CompletionItemProvider = {
    provideCompletionItems(document, position) {
      const prefix = document
        .lineAt(position.line)
        .text.slice(0, position.character);
      if (!/^\s*\*$/.test(prefix)) {
        return undefined;
      }
      const locale = readLocale(document);
      const settings = readSettings(document);
      const fmt = resolveFormat(document.getText(), document.fileName, settings);

      const slots: string[] = [];
      let tab = 1;
      for (let i = 0; i < fmt.timeFieldCount; i++) {
        slots.push(`\${${tab++}:*}`);
      }
      if (fmt.hasUser) {
        slots.push(`\${${tab++}:user}`);
      }
      slots.push(`\${${tab++}:command}`);

      const item = new vscode.CompletionItem(
        "* " + t(locale, "completion.full"),
        vscode.CompletionItemKind.Snippet
      );
      item.insertText = new vscode.SnippetString(slots.join(" "));
      item.detail = "crontab";
      const starIdx = prefix.indexOf("*");
      item.range = new vscode.Range(
        position.line,
        starIdx,
        position.line,
        position.character
      );
      item.preselect = true;
      return [item];
    },
  };

  // --- Diagnostics ---
  const diagnostics = vscode.languages.createDiagnosticCollection("crontab");
  context.subscriptions.push(diagnostics);

  const runDiagnostics = (document: vscode.TextDocument) => {
    if (!isCrontab(document)) {
      return;
    }
    const c = vscode.workspace.getConfiguration(
      "crontabFormatter",
      document.uri
    );
    if (!c.get("validateOnSave", true)) {
      diagnostics.delete(document.uri);
      return;
    }
    const issues = validateDocument(
      document.getText(),
      readSettings(document),
      document.fileName,
      readLocale(document)
    );
    diagnostics.set(
      document.uri,
      issues.map((d) => {
        const diag = new vscode.Diagnostic(
          new vscode.Range(d.line, d.startCol, d.line, d.endCol),
          d.message,
          severityToVs(d.severity)
        );
        if (d.code) {
          diag.code = d.code;
        }
        diag.source = "crontab";
        return diag;
      })
    );
  };

  let debounce: NodeJS.Timeout | undefined;
  const scheduleDiagnostics = (document: vscode.TextDocument) => {
    if (debounce) {
      clearTimeout(debounce);
    }
    debounce = setTimeout(() => runDiagnostics(document), 300);
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(runDiagnostics),
    vscode.workspace.onDidSaveTextDocument(runDiagnostics),
    vscode.workspace.onDidChangeTextDocument((e) =>
      scheduleDiagnostics(e.document)
    ),
    vscode.workspace.onDidCloseTextDocument((doc) =>
      diagnostics.delete(doc.uri)
    ),
    // Re-validate open crontab files when the configuration changes (e.g. the
    // user switches locale), so hints update without editing the file.
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("crontabFormatter")) {
        return;
      }
      for (const doc of vscode.workspace.textDocuments) {
        if (isCrontab(doc)) {
          runDiagnostics(doc);
        }
      }
    })
  );
  if (vscode.window.activeTextEditor) {
    runDiagnostics(vscode.window.activeTextEditor.document);
  }

  // --- Commands ---
  context.subscriptions.push(
    vscode.commands.registerCommand("crontab.formatDocument", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const formatted = formatDocument(
        editor.document.getText(),
        readSettings(editor.document),
        editor.document.fileName
      );
      await editor.edit((b) =>
        b.replace(fullRange(editor.document), formatted)
      );
    }),

    vscode.commands.registerCommand(
      "crontab.explainLine",
      (lineArg?: number) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          return;
        }
        const line =
          typeof lineArg === "number"
            ? lineArg
            : editor.selection.active.line;
        const locale = readLocale(editor.document);
        const explanation = explainLine(
          editor.document.getText(),
          line,
          readSettings(editor.document),
          locale,
          editor.document.fileName
        );
        if (explanation) {
          vscode.window.showInformationMessage(
            `${t(locale, "hover.label")}: ${explanation}`
          );
        } else {
          vscode.window.showWarningMessage(t(locale, "msg.explainFail"));
        }
      }
    ),

    vscode.commands.registerCommand("crontab.detectFormat", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const settings = readSettings(editor.document);
      const locale = readLocale(editor.document);
      const text = editor.document.getText();
      const fmt = resolveFormat(text, editor.document.fileName, settings);
      const doc = parseDocument(text, fmt);
      let cron = 0;
      let bad = 0;
      let env = 0;
      let comments = 0;
      let macros = 0;
      for (const l of doc.lines) {
        if (l.kind === "cron") {
          cron++;
          if (!l.complete) {
            bad++;
          }
        } else if (l.kind === "env") {
          env++;
        } else if (l.kind === "comment") {
          comments++;
        } else if (l.kind === "macro") {
          macros++;
        }
      }
      const issues = validateDocument(
        text,
        settings,
        editor.document.fileName,
        locale
      );
      const err = new Set(issues.map((i) => i.line)).size;
      const kind = t(locale, fmt.hasUser ? "detect.system" : "detect.user");
      vscode.window.showInformationMessage(
        t(locale, "detect.summary", {
          kind,
          seconds: fmt.secondsEnabled,
          year: fmt.yearEnabled,
          cron,
          bad,
          macros,
          env,
          comments,
          err,
        })
      );
    })
  );

  // --- Providers ---
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      SELECTOR,
      formattingProvider
    ),
    vscode.languages.registerDocumentRangeFormattingEditProvider(
      SELECTOR,
      rangeProvider
    ),
    vscode.languages.registerHoverProvider(SELECTOR, hoverProvider),
    vscode.languages.registerCompletionItemProvider(
      SELECTOR,
      completionProvider,
      "*"
    ),
    vscode.languages.registerCodeActionsProvider(
      SELECTOR,
      new CrontabCodeActionProvider(readSettings, readLocale),
      { providedCodeActionKinds: CrontabCodeActionProvider.kinds }
    )
  );
}

export function deactivate() {}
