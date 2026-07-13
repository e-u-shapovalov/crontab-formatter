import { test } from "node:test";
import assert from "node:assert/strict";

import {
  formatDocument,
  analyzeRedirects,
  detectTrailingComment,
  maskNonTopLevel,
} from "../src/formatter";
import { DEFAULT_SETTINGS, FormatterSettings } from "../src/types";

function s(overrides: Partial<FormatterSettings> = {}): FormatterSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

// 1. plain user crontab aligns columns
test("plain user crontab aligns time fields into columns", () => {
  const input = ["0 5 * * * /bin/backup.sh", "30 2 1 * * /usr/bin/cleanup"].join(
    "\n"
  );
  const out = formatDocument(input, s({ mode: "user" }));
  // field widths: f0 max(1,2)=2, f1=1, f2=1, f3=1, f4=1; sep = 2 spaces
  const expected = [
    "0   5  *  *  *  /bin/backup.sh",
    "30  2  1  *  *  /usr/bin/cleanup",
  ].join("\n");
  assert.equal(out, expected);
});

// 2. system crontab with users root / www-data / mysql aligns a user column
test("system crontab aligns a user column", () => {
  const input = [
    "0 5 * * * root /bin/backup.sh",
    "30 2 * * * www-data /usr/bin/cleanup",
    "15 1 * * * mysql /usr/bin/dump",
  ].join("\n");
  const out = formatDocument(input, s({ mode: "system" }));
  // f0 width max(1,2,2)=2 ; f1..f4 width 1 ; user width max(4,8,5)=8
  const expected = [
    "0   5  *  *  *  root      /bin/backup.sh",
    "30  2  *  *  *  www-data  /usr/bin/cleanup",
    "15  1  *  *  *  mysql     /usr/bin/dump",
  ].join("\n");
  assert.equal(out, expected);
});

// 3. command with double quotes preserved exactly
test("double-quoted command preserved byte-for-byte", () => {
  const input = '0 0 * * * echo "hello   world" >> "/var/log/my log.txt"';
  const out = formatDocument(input, s({ mode: "user" }));
  assert.ok(
    out.includes('echo "hello   world" >> "/var/log/my log.txt"'),
    out
  );
});

// 4. command with single quotes + $(...) + backticks preserved
test("single quotes, $() and backticks preserved", () => {
  const cmd = "sh -c 'echo $(date) `hostname`'";
  const input = "5 4 * * * " + cmd;
  const out = formatDocument(input, s({ mode: "user" }));
  assert.ok(out.includes(cmd), out);
});

// 5. command with pipes and redirects preserved exactly
test("pipes and redirects preserved exactly", () => {
  const cmd = "ps aux | grep x > /tmp/out 2>&1";
  const input = "* * * * * " + cmd;
  const out = formatDocument(input, s({ mode: "user" }));
  assert.equal(out, "*  *  *  *  *  " + cmd);
});

// 6. command containing a `#` stays in the command by default (NOT split)
test("inline # stays in command when alignComments is off", () => {
  const cmd = "/usr/bin/foo # this is not a comment";
  const input = "0 0 * * * " + cmd;
  const out = formatDocument(input, s({ mode: "user" }));
  assert.equal(out, "0  0  *  *  *  " + cmd);
});

// 7. env variables untouched by default
test("env lines untouched by default", () => {
  const input = [
    "PATH=/usr/bin:/bin",
    'MAILTO="x@y"',
    "SHELL=/bin/bash",
    "CRON_TZ=Asia/Bishkek",
  ].join("\n");
  const out = formatDocument(input, s({ mode: "user" }));
  assert.equal(out, input);
});

// 8. alignEnvEquals=true aligns the `=`
test("alignEnvEquals aligns equals signs", () => {
  const input = ["PATH=/usr/bin", "SHELL=/bin/bash", "X=y"].join("\n");
  const out = formatDocument(input, s({ mode: "user", alignEnvEquals: true }));
  // key width = max("PATH","SHELL","X") = 5 ; format: key.padEnd(5) + " = " + value
  const expected = [
    "PATH  = /usr/bin",
    "SHELL = /bin/bash",
    "X     = y",
  ].join("\n");
  assert.equal(out, expected);
});

// 9. empty lines preserved
test("empty lines preserved between entries", () => {
  const input = ["0 0 * * * /a", "", "30 0 * * * /b"].join("\n");
  const out = formatDocument(input, s({ mode: "user" }));
  const expected = ["0   0  *  *  *  /a", "", "30  0  *  *  *  /b"].join("\n");
  assert.equal(out, expected);
});

// 10. full-line comments preserved verbatim
test("full-line comments preserved verbatim", () => {
  const input = [
    "# my header comment with  spaces",
    "0 0 * * * /a",
  ].join("\n");
  const out = formatDocument(input, s({ mode: "user" }));
  const expected = ["# my header comment with  spaces", "0  0  *  *  *  /a"].join(
    "\n"
  );
  assert.equal(out, expected);
});

// 11. @reboot macro aligns and keeps command
test("@reboot macro padded with command kept raw", () => {
  // alongside another macro so macro width is exercised
  const input = ["@reboot /opt/start.sh", "@daily /opt/clean.sh"].join("\n");
  const out = formatDocument(input, s({ mode: "user" }));
  // macro width = max("@reboot"=7,"@daily"=6) = 7 ; sep 2 spaces
  const expected = [
    "@reboot  /opt/start.sh",
    "@daily   /opt/clean.sh",
  ].join("\n");
  assert.equal(out, expected);
});

// 12. @daily with a user keeps `root /path` as remainder
test("@daily keeps user+command as raw remainder", () => {
  const input = "@daily root /opt/clean.sh";
  const out = formatDocument(input, s({ mode: "system" }));
  // single macro: macroWidth=6, remainder kept raw verbatim
  assert.equal(out, "@daily  root /opt/clean.sh");
});

// 13. invalid / incomplete line left unchanged
test("incomplete cron line (3 fields) left unchanged", () => {
  const input = "* * *";
  const out = formatDocument(input, s({ mode: "user" }));
  assert.equal(out, "* * *");
});

test("non-cron command-only line left unchanged", () => {
  // "php script.php" -> first 5 tokens not valid cron fields -> incomplete
  const input = "php script.php";
  const out = formatDocument(input, s({ mode: "user" }));
  assert.equal(out, "php script.php");
});

// 14. mixed file formats coherently
test("mixed file (comment + env + cron + macro + blank) formats coherently", () => {
  const input = [
    "# header",
    "PATH=/usr/bin",
    "",
    "0 5 * * * /bin/backup.sh",
    "30 2 1 * * /usr/bin/cleanup",
    "@reboot /opt/start.sh",
  ].join("\n");
  const out = formatDocument(input, s({ mode: "user" }));
  const expected = [
    "# header",
    "PATH=/usr/bin",
    "",
    "0   5  *  *  *  /bin/backup.sh",
    "30  2  1  *  *  /usr/bin/cleanup",
    "@reboot  /opt/start.sh",
  ].join("\n");
  assert.equal(out, expected);
});

// 15. IDEMPOTENCY
test("formatting is idempotent for representative inputs", () => {
  const samples: Array<[string, FormatterSettings]> = [
    [
      ["0 5 * * * /bin/backup.sh", "30 2 1 * * /usr/bin/cleanup"].join("\n"),
      s({ mode: "user" }),
    ],
    [
      [
        "0 5 * * * root /bin/backup.sh",
        "30 2 * * * www-data /usr/bin/cleanup",
      ].join("\n"),
      s({ mode: "system" }),
    ],
    [
      ["@reboot /opt/start.sh", "@daily /opt/clean.sh"].join("\n"),
      s({ mode: "user" }),
    ],
    [
      ["PATH=/usr/bin", "SHELL=/bin/bash"].join("\n"),
      s({ mode: "user", alignEnvEquals: true }),
    ],
    [
      "0 0 * * * /script.sh # health check",
      s({ mode: "user", alignComments: true }),
    ],
  ];
  for (const [input, settings] of samples) {
    const once = formatDocument(input, settings);
    const twice = formatDocument(once, settings);
    assert.equal(twice, once, `not idempotent for: ${JSON.stringify(input)}`);
  }
});

// 16. CRLF / LF / trailing newline handling
test("CRLF input keeps CRLF endings", () => {
  const input = "0 5 * * * /a\r\n30 2 * * * /b";
  const out = formatDocument(input, s({ mode: "user" }));
  assert.ok(out.includes("\r\n"));
  assert.ok(!/\n(?<!\r\n)/.test(out.replace(/\r\n/g, "")));
  assert.equal(out, "0   5  *  *  *  /a\r\n30  2  *  *  *  /b");
});

test("LF input stays LF", () => {
  const input = "0 5 * * * /a\n30 2 * * * /b";
  const out = formatDocument(input, s({ mode: "user" }));
  assert.ok(!out.includes("\r\n"));
  assert.equal(out, "0   5  *  *  *  /a\n30  2  *  *  *  /b");
});

test("trailing newline preserved when present", () => {
  const input = "0 5 * * * /a\n";
  const out = formatDocument(input, s({ mode: "user" }));
  assert.ok(out.endsWith("\n"));
  assert.equal(out, "0  5  *  *  *  /a\n");
});

test("trailing newline absent when input has none", () => {
  const input = "0 5 * * * /a";
  const out = formatDocument(input, s({ mode: "user" }));
  assert.ok(!out.endsWith("\n"));
});

// 17. minSpacesBetweenColumns=4 widens gaps
test("minSpacesBetweenColumns=4 widens column gaps", () => {
  const input = ["0 5 * * * /a", "30 2 * * * /b"].join("\n");
  const out = formatDocument(input, s({ mode: "user", minSpacesBetweenColumns: 4 }));
  const expected = [
    "0     5    *    *    *    /a",
    "30    2    *    *    *    /b",
  ].join("\n");
  assert.equal(out, expected);
});

// 18. alignComments=true aligns a trailing comment; # inside quotes is NOT a comment
test("alignComments aligns a safe trailing comment", () => {
  const input = "0 0 * * * /script.sh # health check";
  const out = formatDocument(input, s({ mode: "user", alignComments: true }));
  // single line: fields all width 1, code="/script.sh", then sep + "# health check"
  const expected = "0  0  *  *  *  /script.sh  # health check";
  assert.equal(out, expected);
});

test("alignComments does not split a # inside quotes", () => {
  const cmd = 'echo "value # not a comment"';
  const input = "0 0 * * * " + cmd;
  const out = formatDocument(input, s({ mode: "user", alignComments: true }));
  assert.equal(out, "0  0  *  *  *  " + cmd);
});

// 19. preserveIndentation
test("preserveIndentation keeps leading whitespace when true", () => {
  const input = "    0 0 * * * /a";
  const out = formatDocument(input, s({ mode: "user", preserveIndentation: true }));
  assert.ok(out.startsWith("    0"));
  assert.equal(out, "    0  0  *  *  *  /a");
});

test("preserveIndentation strips leading whitespace when false", () => {
  const input = "    0 0 * * * /a";
  const out = formatDocument(
    input,
    s({ mode: "user", preserveIndentation: false })
  );
  assert.ok(!out.startsWith(" "));
  assert.equal(out, "0  0  *  *  *  /a");
});

// 20. inconsistent leading whitespace is normalized away (the reported bug)
test("inconsistent leading indentation does not misalign columns", () => {
  const input = ["0 9-18 * * 1-6 /a", "  */20 * * * * /b"].join("\n");
  const out = formatDocument(input, s({ mode: "user" }));
  const lines = out.split("\n");
  // leading whitespace is stripped and commands line up (columns aligned)
  assert.ok(!lines[0].startsWith(" "));
  assert.ok(!lines[1].startsWith(" "));
  assert.equal(lines[0].indexOf("/a"), lines[1].indexOf("/b"));
});

// 21. alignRedirects lines up the redirect tail
test("alignRedirects aligns the > column across lines", () => {
  const input = [
    "0 3 * * 1 /usr/bin/backup.sh > /var/log/backup.log 2>&1",
    "*/15 * * * * curl http://x/health > /dev/null 2>&1",
  ].join("\n");
  const out = formatDocument(input, s({ mode: "user", alignRedirects: true }));
  const lines = out.split("\n");
  const c0 = lines[0].indexOf("> /var/log");
  const c1 = lines[1].indexOf("> /dev/null");
  assert.ok(c0 > 0 && c0 === c1, out);
  // command bodies untouched
  assert.ok(out.includes("/usr/bin/backup.sh"));
  assert.ok(out.includes("curl http://x/health"));
});

test("alignRedirects does not split a > inside quotes", () => {
  const input = '0 0 * * * echo "a > b"';
  const out = formatDocument(input, s({ mode: "user", alignRedirects: true }));
  assert.ok(out.endsWith('echo "a > b"'), out);
});

// 22. insertHeader prepends a reminder and is idempotent
test("insertHeader prepends a reminder legend", () => {
  const input = ["0 5 * * * /a", "30 2 * * * /b"].join("\n");
  const out = formatDocument(input, s({ mode: "user", insertHeader: true }));
  const lines = out.split("\n");
  assert.ok(lines[0].startsWith("# min"), out);
  assert.ok(lines[0].includes("command"));
  assert.equal(lines.length, 3);
});

test("insertHeader is not duplicated when a header already exists", () => {
  const input = [
    "# min  hour  day  month  weekday  command",
    "0 5 * * * /a",
  ].join("\n");
  const out = formatDocument(input, s({ mode: "user", insertHeader: true }));
  const headerCount = out
    .split("\n")
    .filter((l) => /min/.test(l) && /command/.test(l)).length;
  assert.equal(headerCount, 1, out);
});

test("insertHeader adds a user column header in system mode", () => {
  const input = "0 5 * * * root /a";
  const out = formatDocument(input, s({ mode: "system", insertHeader: true }));
  assert.ok(out.split("\n")[0].includes("user"), out);
});

// 23. idempotency for the new features
test("alignRedirects and insertHeader are idempotent", () => {
  const samples: Array<[string, FormatterSettings]> = [
    [
      [
        "0 3 * * 1 /usr/bin/backup.sh > /var/log/backup.log 2>&1",
        "*/15 * * * * curl http://x/health > /dev/null 2>&1",
      ].join("\n"),
      s({ mode: "user", alignRedirects: true }),
    ],
    [
      ["0 5 * * * /a", "30 2 * * * /b"].join("\n"),
      s({ mode: "user", insertHeader: true }),
    ],
    [
      "0 0 * * * /script.sh > /var/log/s.log 2>&1 # daily",
      s({ mode: "user", alignRedirects: true, alignComments: true }),
    ],
    [
      "0 0 * * * echo $(date > /tmp/x) > /var/log/s.log 2>&1 # note",
      s({ mode: "user", alignRedirects: true, alignComments: true }),
    ],
  ];
  for (const [input, settings] of samples) {
    const once = formatDocument(input, settings);
    const twice = formatDocument(once, settings);
    assert.equal(twice, once, `not idempotent for: ${JSON.stringify(input)}`);
  }
});

// 24. command substitution $(...) is never mistaken for a redirect or comment
test("alignRedirects does not split a > inside $(...)", () => {
  const cmd = "echo $(date > /tmp/foo)";
  const input = "0 0 * * * " + cmd;
  const out = formatDocument(input, s({ mode: "user", alignRedirects: true }));
  assert.equal(out, "0  0  *  *  *  " + cmd);
});

test("alignComments does not split a # inside $(...)", () => {
  const cmd = "echo $(echo # inside)";
  const input = "0 0 * * * " + cmd;
  const out = formatDocument(input, s({ mode: "user", alignComments: true }));
  assert.equal(out, "0  0  *  *  *  " + cmd);
});

test("alignRedirects still aligns a real redirect after a $() body", () => {
  const input = [
    "0 0 * * * echo $(date) > /var/log/a.log 2>&1",
    "0 0 * * * /bin/b $(id) > /var/log/b.log 2>&1",
  ].join("\n");
  const out = formatDocument(input, s({ mode: "user", alignRedirects: true }));
  const lines = out.split("\n");
  const c0 = lines[0].indexOf("> /var/log");
  const c1 = lines[1].indexOf("> /var/log");
  assert.ok(c0 > 0 && c0 === c1, out);
  assert.ok(out.includes("echo $(date)"), out);
  assert.ok(out.includes("/bin/b $(id)"), out);
});

// 25. the redirect analyzer (shared by validator + code actions) ignores a >
// hidden inside $()/quotes and models fd targets and order
test("analyzeRedirects ignores > inside quotes and $()", () => {
  assert.equal(analyzeRedirects("cmd > /log").stdout, true);
  assert.equal(analyzeRedirects('echo "a > b"').stdout, false);
  assert.equal(analyzeRedirects("echo $(date > /tmp/x)").stdout, false);
});

test("analyzeRedirects models fd targets, duplication and order", () => {
  const st = (c: string) => {
    const r = analyzeRedirects(c);
    return [r.stdout, r.stderr];
  };
  assert.deepEqual(st("cmd 2>&1"), [false, false]); // stdout still on console
  assert.deepEqual(st("cmd >/log"), [true, false]);
  assert.deepEqual(st("cmd >/log 2>&1"), [true, true]);
  assert.deepEqual(st("cmd 2>&1 >/dev/null"), [true, false]); // order matters
  assert.deepEqual(st("cmd 2>/tmp/err"), [false, true]);
  assert.deepEqual(st("cmd &>/log"), [true, true]);
  assert.deepEqual(st("cmd 1>&2"), [false, false]);
});

// 26. alignRedirects must never split a fd/operator fused to the command word,
// which would change the executable or arguments (byte-for-byte contract).
test("alignRedirects does not split a digit fused to the command word", () => {
  for (const cmd of [
    "python2>/tmp/out",
    "echo version2>/tmp/out",
    "cat <>/tmp/state",
    "cat 3<>/tmp/state",
  ]) {
    const out = formatDocument(
      "0 0 * * * " + cmd,
      s({ mode: "user", alignRedirects: true })
    );
    assert.equal(out, "0  0  *  *  *  " + cmd, cmd);
  }
});

test("alignRedirects still splits a standalone fd redirect", () => {
  const out = formatDocument(
    "0 0 * * * cmd 2>&1",
    s({ mode: "user", alignRedirects: true })
  );
  assert.equal(out, "0  0  *  *  *  cmd  2>&1");
});

// 27. the shared scanner handles backslash escaping and process substitution
test("analyzeRedirects handles escaping and process substitution", () => {
  // an escaped opening quote must not hide a real top-level redirect
  assert.equal(analyzeRedirects('printf \\"hi\\" > /log').stdout, true);
  // an escaped > is a literal, not a redirect
  assert.equal(analyzeRedirects("echo a \\> b").stdout, false);
  // > inside a process substitution is not the job's redirect
  assert.equal(analyzeRedirects("diff <(cmd >f) <(cmd2)").stdout, false);
});

// 28. the scanner masks nested quotes inside a substitution, an escaped-$ +
// bare subshell, and bare subshell groups (the round-4 critical class)
test("analyzeRedirects masks nested quotes / subshell content", () => {
  // a > inside "$(printf "…")" is the subshell's, not the job's
  assert.equal(analyzeRedirects('mail -s "$(printf "a > b")" x').stdout, false);
  // escaped-$ then a bare subshell group
  assert.equal(analyzeRedirects("cmd \\$(date > /x)").stdout, false);
  // a bare subshell group masks its content; the outer > is the job's redirect
  assert.equal(analyzeRedirects("(cmd > inner) > log").stdout, true);
});

test("formatDocument preserves bytes of nested-quote / subshell commands", () => {
  const settings = s({ mode: "user", alignRedirects: true });
  for (const cmd of ['mail -s "$(printf "a > b")" x', "cmd \\$(date > /x)"]) {
    const out = formatDocument("0 0 * * * " + cmd, settings);
    assert.equal(out, "0  0  *  *  *  " + cmd, cmd);
    assert.equal(formatDocument(out, settings), out, "idempotent " + cmd);
  }
});

test("alignRedirects does not split a > inside a trailing comment", () => {
  const cmd = "cmd # x > y";
  const out = formatDocument(
    "0 0 * * * " + cmd,
    s({ mode: "user", alignRedirects: true })
  );
  assert.equal(out, "0  0  *  *  *  " + cmd);
});

// 29. `>&word` and `&>word` redirect BOTH streams to the file (bash 3.6.4);
// only `>&N` (bare fd number) is a duplication. `>&2026.log` is a filename.
test("analyzeRedirects: >&file and &>file redirect both streams", () => {
  const st = (c: string) => {
    const r = analyzeRedirects(c);
    return [r.stdout, r.stderr];
  };
  assert.deepEqual(st("cmd >&file"), [true, true]);
  assert.deepEqual(st("cmd >&/var/log/x.log"), [true, true]);
  assert.deepEqual(st("cmd &>file"), [true, true]);
  assert.deepEqual(st("cmd >&2"), [false, false]); // dup stdout -> fd2 (console)
  assert.deepEqual(st("cmd >&2026.log"), [true, true]); // filename, not a dup
});

test("bad-redirect flags >1&2 and 2>>&1 but not a valid > 2 &", () => {
  assert.notEqual(analyzeRedirects("cmd >1&2").bad, null);
  assert.notEqual(analyzeRedirects("cmd 2>>&1").bad, null); // >>& is a syntax error
  assert.equal(analyzeRedirects("cmd > 2 &").bad, null);
});

// 30. `<(` / `>(` inside double quotes are literal, not process substitution,
// so a real redirect after the string is still detected
test("process substitution markers inside double quotes are literal", () => {
  assert.equal(analyzeRedirects('echo "a >(" > /log').stdout, true);
  assert.equal(analyzeRedirects('echo "x <(" > /log').stdout, true);
  // a genuine top-level process substitution is still masked
  assert.equal(analyzeRedirects("diff <(a) <(b) > /log").stdout, true);
  assert.equal(analyzeRedirects('echo "$(date)" > /log').stdout, true);
});

test("a # inside a substitution is not a trailing comment", () => {
  assert.equal(detectTrailingComment('echo "$(x # y)" z'), null);
  assert.equal(detectTrailingComment("echo $(a # b)"), null);
  assert.equal(detectTrailingComment("cmd # note")?.comment, "# note");
});

// 31. a # after an escaped space is part of the word, not a comment
test("a # after an escaped space is not a trailing comment", () => {
  assert.equal(detectTrailingComment("rm /tmp/x\\ y\\ #daily"), null);
  // an escaped backslash leaves the following space unescaped => real comment
  assert.equal(detectTrailingComment("a\\\\ #b")?.comment, "#b");
  // alignComments must not change the bytes of a command with escaped spaces
  const input = "0 0 * * * rm /tmp/x\\ y\\ #daily";
  const out = formatDocument(input, s({ mode: "user", alignComments: true }));
  assert.equal(out, "0  0  *  *  *  rm /tmp/x\\ y\\ #daily");
});

// 32. insertHeader must not be fooled by substrings like "Admin"/"commands"
test("insertHeader is inserted even when a comment contains min/command substrings", () => {
  const input = ["# Admin commands below", "0 5 * * * /a"].join("\n");
  const out = formatDocument(input, s({ mode: "user", insertHeader: true }));
  assert.equal(out.split("\n").length, 3, out);
  assert.ok(/^# min\b/.test(out.split("\n")[0]), out);
});

// 33. the mask preserves length on adversarial inputs (index-alignment invariant)
test("maskNonTopLevel preserves length on adversarial inputs", () => {
  for (const c of [
    'mail -s "$(printf "a > b")" x',
    "cmd \\$(date > /x)",
    "echo 'no close",
    "echo $(a $(b > c) d) > e",
    "a\\\\\\\" > f",
    "diff <(x) >(y) > f",
    "((nested > x) > out",
  ]) {
    assert.equal(maskNonTopLevel(c).length, c.length, JSON.stringify(c));
  }
});
