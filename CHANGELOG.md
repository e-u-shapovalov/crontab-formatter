# Changelog / Журнал изменений

All notable changes to the Crontab Formatter extension are documented in this file in English and Russian.

Все заметные изменения расширения Crontab Formatter перечислены в этом файле на английском и русском языках.

## English

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

### 0.3.0

Первый публичный выпуск.

- Выравнивание временных полей crontab и системной колонки `USER` через стандартные **Format Document**, **Format Selection** и **Format on Save**. Обычное выравнивание колонок сохраняет тело команды, а повторное форматирование даёт стабильный результат.
- Поддержка пользовательского crontab, системного crontab и раскладки `cron.d`, `@`-макросов, присваиваний окружения, комментариев и пустых строк с автоматическим определением user/system-формата.
- Необязательное выравнивание хвостов перенаправления (`>`, `>>`, `2>&1`), безопасных хвостовых комментариев и `=` в присваиваниях окружения, а также необязательная строка-памятка.
- Мягкая неблокирующая диагностика диапазонов полей, `*/0`, перевёрнутых диапазонов, неизвестных макросов, отсутствующего пользователя в системном режиме и отсутствующего или ошибочного перенаправления вывода.
- Расшифровка расписания при наведении и по команде с помощью `cronstrue` на русском и английском языках.
- Явные быстрые исправления для добавления `>/dev/null 2>&1`, перенаправления в лог, вставки `/usr/bin/php`, расшифровки расписания и преобразования точного расписания в равноценный `@`-макрос.
- Встроенная TextMate-грамматика для подсветки синтаксиса crontab.
