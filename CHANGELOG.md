# Changelog / Журнал изменений

All notable changes to the Crontab Formatter extension are documented in this file in English and Russian.

Все заметные изменения расширения Crontab Formatter перечислены в этом файле на английском и русском языках.

## English

### 1.0.0

First stable release, published to the Visual Studio Marketplace.

- Hardened the shell scanner shared by formatting, diagnostics and quick fixes: quotes, backticks, `$()`/`<()` substitutions (including nested quotes and backslash escaping) and bare subshells are handled correctly, so column alignment never changes the bytes of a command.
- Redirect diagnostics now model the stdout/stderr file descriptors (operator order, duplication, `>&file`, `2>&1`) instead of only looking for a `>`.
- Localized the "explain schedule" and "convert to macro" quick-fix titles.
- More accurate user/system auto-detection — ordinary commands such as `mysql -e …` or `date >> …` are no longer mistaken for a system user column.
- Schedule explanations now include the year field when `crontabFormatter.yearField` is enabled.
- Slimmed the packaged extension (only the `ru`/`en` `cronstrue` runtime is shipped).

### 0.3.0

Initial public release.

- Column alignment for crontab time fields and the system `USER` column through native **Format Document**, **Format Selection**, and **Format on Save**. Normal column formatting preserves the command body, and repeated formatting produces stable output.
- Support for user crontab, system crontab and `cron.d` layouts, `@macros`, environment assignments, comments, and blank lines, with automatic user/system layout detection.
- Optional alignment of redirect tails (`>`, `>>`, `2>&1`), safe trailing comments, and environment-assignment `=`, plus an optional reminder header.
- Soft, non-blocking diagnostics for field ranges, `*/0`, reversed ranges, unknown macros, a missing user in system mode, and missing or malformed output redirection.
- Schedule explanations on hover and on demand, powered by `cronstrue` in Russian and English.
- Explicit quick fixes for adding `>/dev/null 2>&1`, adding a log redirect, inserting `/usr/bin/php`, explaining a schedule, and converting an exact schedule to an equivalent `@macro`.
- Bundled TextMate grammar for crontab syntax highlighting.

## Русский

### 1.0.0

Первый стабильный выпуск, опубликованный в Visual Studio Marketplace.

- Усилен разбор команд, общий для форматирования, диагностики и быстрых исправлений: кавычки, бэктики, подстановки `$()`/`<()` (включая вложенные кавычки и экранирование обратным слэшем) и подоболочки обрабатываются корректно, поэтому выравнивание колонок никогда не меняет байты команды.
- Диагностика перенаправлений теперь моделирует файловые дескрипторы stdout/stderr (порядок операторов, дублирование, `>&file`, `2>&1`), а не просто ищет `>`.
- Локализованы названия быстрых исправлений «объяснить расписание» и «преобразовать в макрос».
- Точнее автоопределение user/system — обычные команды вроде `mysql -e …` или `date >> …` больше не принимаются за системную колонку пользователя.
- Расшифровка расписания теперь включает поле года, когда включён `crontabFormatter.yearField`.
- Пакет расширения урезан (в поставке только рантайм `cronstrue` для `ru`/`en`).

### 0.3.0

Первый публичный выпуск.

- Выравнивание временных полей crontab и системной колонки `USER` через стандартные **Format Document**, **Format Selection** и **Format on Save**. Обычное выравнивание колонок сохраняет тело команды, а повторное форматирование даёт стабильный результат.
- Поддержка пользовательского crontab, системного crontab и раскладки `cron.d`, `@`-макросов, присваиваний окружения, комментариев и пустых строк с автоматическим определением user/system-формата.
- Необязательное выравнивание хвостов перенаправления (`>`, `>>`, `2>&1`), безопасных хвостовых комментариев и `=` в присваиваниях окружения, а также необязательная строка-памятка.
- Мягкая неблокирующая диагностика диапазонов полей, `*/0`, перевёрнутых диапазонов, неизвестных макросов, отсутствующего пользователя в системном режиме и отсутствующего или ошибочного перенаправления вывода.
- Расшифровка расписания при наведении и по команде с помощью `cronstrue` на русском и английском языках.
- Явные быстрые исправления для добавления `>/dev/null 2>&1`, перенаправления в лог, вставки `/usr/bin/php`, расшифровки расписания и преобразования точного расписания в равноценный `@`-макрос.
- Встроенная TextMate-грамматика для подсветки синтаксиса crontab.
