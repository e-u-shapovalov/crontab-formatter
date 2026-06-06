# Crontab Formatter

A practical formatter for crontab files. Aligns schedules into clean columns
via VS Code's native **Format Document / Format Selection / Format on Save** —
and never changes the meaning of a command or a schedule.

## Before / After

```crontab
0 3 * * 1 /usr/bin/backup.sh
30 0 * * * root /opt/scripts/cleanup --verbose
*/15 * * * * curl -s http://localhost/health
```

```crontab
0     3  *  *  1  /usr/bin/backup.sh
30    0  *  *  *  root /opt/scripts/cleanup --verbose
*/15  *  *  *  *  curl -s http://localhost/health
```

## What it does

- **Column alignment** of the time fields (and the system `USER` column).
- **Commands are never touched** — quotes, pipes, redirects, `&&`, `||`, `%`,
  `$()`, backticks and inline `#` are preserved byte-for-byte. Internal
  whitespace is not normalized.
- **Idempotent**: formatting an already-formatted file changes nothing.
- **Supported line types**: user crontab (`MIN HOUR DOM MON DOW COMMAND`),
  system crontab / `cron.d` (adds `USER`), macros (`@reboot`, `@daily`, …),
  environment assignments (`PATH=…`, `MAILTO=…`, `CRON_TZ=…`), comments and
  blank lines — each handled correctly and left intact when it should be.
- **Soft validation** (diagnostics): field ranges, `*/0`, reversed ranges,
  unknown macros, missing user in system mode, relative paths, and missing
  output redirection — all as warnings/hints, never blocking formatting.
- **Hover explanation** of the schedule (powered by cronstrue, `ru`/`en`).
- **Safe quick fixes** (Code Actions): add `>/dev/null 2>&1`, add a log
  redirect, insert absolute `/usr/bin/php`, explain the schedule, and convert
  an exact schedule to its `@macro` — **only when you ask**. The formatter
  itself never rewrites a schedule.

## Commands

- **Crontab: Format Document**
- **Crontab: Explain current line**
- **Crontab: Detect Format** — reports user/system, seconds, and line counts.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `crontabFormatter.mode` | `auto` | `auto` / `user` / `system` field layout. |
| `crontabFormatter.secondsField` | `auto` | Leading seconds field (`auto`=off). |
| `crontabFormatter.yearField` | `auto` | Trailing year field (`auto`=off). |
| `crontabFormatter.alignComments` | `false` | Align safe trailing `#` comments. |
| `crontabFormatter.alignRedirects` | `false` | Align the `>`/`>>`/`2>&1` tail into its own column. |
| `crontabFormatter.alignEnvEquals` | `false` | Align `=` in env assignments. |
| `crontabFormatter.insertHeader` | `false` | Insert a `# min hour day month weekday command` reminder at the top. |
| `crontabFormatter.preserveIndentation` | `false` | Keep leading whitespace (off = align from the left edge). |
| `crontabFormatter.minSpacesBetweenColumns` | `2` | Spaces between columns. |
| `crontabFormatter.formatMacros` | `true` | Align `@macro` lines. |
| `crontabFormatter.validateOnSave` | `true` | Run diagnostics. |
| `crontabFormatter.explainHover` | `true` | Schedule explanation on hover. |
| `crontabFormatter.locale` | `ru` | UI language: `auto` / `ru` / `en`. |

Tip: in the **Extensions** view, the ⚙️ gear → **Extension Settings** jumps straight to these.

### Redirect cheat sheet

- `>` overwrites the file (old logs are wiped).
- `>>` appends to the end of the file.
- `2>&1` sends errors (stderr) to the same place as the output (stdout).
- Common forms: `command >/dev/null 2>&1` (discard) or `command >>/var/log/x.log 2>&1` (keep a log).

The validator flags missing/half/malformed redirections (e.g. `>1&2`) with the correct form, and typing `*` on an empty line offers to fill the whole schedule.

## Usage

Open a crontab file and run **Format Document** (`Shift+Alt+F`), or enable
format on save:

```jsonc
"[crontab]": {
  "editor.defaultFormatter": "EvgeniiShapovalov.crontab-formatter",
  "editor.formatOnSave": true
}
```

## Syntax highlighting

The extension ships its own TextMate grammar, so crontab files are coloured out
of the box — no companion highlighter needed:

- the **schedule** (the five time fields and `@macros`) gets one colour;
- the **command / path** gets another;
- the target after **`>`** (overwrite) gets a third colour;
- the target after **`>>`** (append) gets a fourth — so you can tell at a glance
  whether a log is being wiped or kept.

Comments, environment assignments (`PATH=…`) and `$VARIABLES` are highlighted
too. Exact colours come from your active theme.

---

## По-русски

Практичный форматтер для crontab-файлов. Выравнивает расписания в аккуратные
колонки через родные **Format Document / Format Selection / Format on Save** —
и никогда не меняет смысл команды или расписания.

### Что делает

- **Выравнивание колонок** временных полей (и колонки `USER` в системном формате).
- **Команды не трогаются** — кавычки, пайпы, перенаправления, `&&`, `||`, `%`,
  `$()`, бэктики и внутренний `#` сохраняются байт-в-байт. Внутренние пробелы
  не нормализуются.
- **Идемпотентность**: повторное форматирование уже отформатированного файла
  ничего не меняет.
- **Поддерживаемые строки**: пользовательский crontab
  (`MIN HOUR DOM MON DOW COMMAND`), системный crontab / `cron.d` (с колонкой
  `USER`), макросы (`@reboot`, `@daily`, …), присваивания окружения
  (`PATH=…`, `MAILTO=…`, `CRON_TZ=…`), комментарии и пустые строки.
- **Мягкая валидация** (диагностика): диапазоны полей, `*/0`, перевёрнутые
  диапазоны, неизвестные макросы, отсутствие пользователя в системном режиме,
  относительные пути и отсутствие перенаправления вывода — всё как
  предупреждения/подсказки, форматирование не блокируется.
- **Расшифровка при наведении** на строку расписания (через cronstrue, `ru`/`en`).
- **Безопасные быстрые исправления** (Code Actions): добавить `>/dev/null 2>&1`,
  добавить лог-редирект, вставить абсолютный `/usr/bin/php`, объяснить
  расписание, превратить точное расписание в `@macro` — **только по запросу**.

### Команды

- **Crontab: Format Document** — отформатировать документ.
- **Crontab: Explain current line** — объяснить текущую строку.
- **Crontab: Detect Format** — показать формат (user/system), секунды и счётчики строк.

### Настройки

| Параметр | По умолчанию | Описание |
| --- | --- | --- |
| `crontabFormatter.mode` | `auto` | Раскладка полей: `auto` / `user` / `system`. |
| `crontabFormatter.secondsField` | `auto` | Ведущее поле секунд (`auto` = выкл). |
| `crontabFormatter.yearField` | `auto` | Хвостовое поле года (`auto` = выкл). |
| `crontabFormatter.alignComments` | `false` | Выравнивать безопасные хвостовые `#`-комментарии. |
| `crontabFormatter.alignRedirects` | `false` | Выравнивать хвост `>`/`>>`/`2>&1` в свою колонку. |
| `crontabFormatter.alignEnvEquals` | `false` | Выравнивать `=` в присваиваниях окружения. |
| `crontabFormatter.insertHeader` | `false` | Вставить вверху напоминание `# min hour day month weekday command`. |
| `crontabFormatter.preserveIndentation` | `false` | Сохранять ведущие пробелы (выкл = выравнивание от левого края). |
| `crontabFormatter.minSpacesBetweenColumns` | `2` | Пробелов между колонками. |
| `crontabFormatter.formatMacros` | `true` | Выравнивать строки `@macro`. |
| `crontabFormatter.validateOnSave` | `true` | Запускать диагностику. |
| `crontabFormatter.explainHover` | `true` | Расшифровка расписания при наведении. |
| `crontabFormatter.locale` | `ru` | Язык интерфейса: `auto` / `ru` / `en`. |

Совет: в панели **Extensions** иконка ⚙️ → **Extension Settings** ведёт прямо к этим настройкам.

### Шпаргалка по перенаправлениям

- `>` перезаписывает файл (старые логи стираются).
- `>>` дописывает в конец файла.
- `2>&1` отправляет ошибки (stderr) туда же, куда и вывод (stdout).
- Частые формы: `command >/dev/null 2>&1` (отбросить) или
  `command >>/var/log/x.log 2>&1` (вести лог).

Валидатор отмечает пропущенные/неполные/кривые перенаправления (например `>1&2`)
и предлагает правильную форму, а ввод `*` на пустой строке предложит заполнить
всё расписание.

### Использование

Откройте crontab-файл и выполните **Format Document** (`Shift+Alt+F`) или
включите форматирование при сохранении:

```jsonc
"[crontab]": {
  "editor.defaultFormatter": "EvgeniiShapovalov.crontab-formatter",
  "editor.formatOnSave": true
}
```

### Подсветка синтаксиса

Расширение поставляется с собственной TextMate-грамматикой, поэтому
crontab-файлы раскрашиваются из коробки — отдельный подсветчик не нужен:

- **расписание** (пять временных полей и `@macros`) — одним цветом;
- **команда / путь** — другим;
- цель после **`>`** (перезапись) — третьим цветом;
- цель после **`>>`** (дозапись) — четвёртым, чтобы сразу видеть, затирается
  лог или дописывается.

Комментарии, присваивания окружения (`PATH=…`) и `$ПЕРЕМЕННЫЕ` тоже
подсвечиваются. Конкретные цвета берутся из вашей активной темы.

## License

MIT © Evgenii Shapovalov
