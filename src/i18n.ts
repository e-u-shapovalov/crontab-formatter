/**
 * Tiny localization layer. Pure (no vscode). Messages are functions so they can
 * take parameters. Russian is the default; English is the fallback.
 */

import { Locale } from "./types";

const FIELD_NAMES: Record<Locale, Record<string, string>> = {
  ru: {
    second: "секунды",
    minute: "минуты",
    hour: "часы",
    "day-of-month": "день месяца",
    month: "месяц",
    "day-of-week": "день недели",
    year: "год",
  },
  en: {
    second: "second",
    minute: "minute",
    hour: "hour",
    "day-of-month": "day-of-month",
    month: "month",
    "day-of-week": "day-of-week",
    year: "year",
  },
};

export function fieldName(locale: Locale, id: string): string {
  return FIELD_NAMES[locale][id] ?? id;
}

type Msg = (...a: any[]) => string;

export const MESSAGES: Record<Locale, Record<string, Msg>> = {
  ru: {
    "few-fields": (n: number) =>
      `Слишком мало или невалидные cron-поля (ожидается ${n} полей расписания)`,
    "empty-command": () => "Пустая команда после расписания",
    "unknown-macro": (m: string) => `Неизвестный макрос ${m}`,
    "missing-user": () =>
      "В system-режиме ожидается поле пользователя после расписания",
    "relative-path": () =>
      "В cron лучше использовать абсолютные пути, напр. /usr/bin/php /var/www/site/script.php",
    "no-redirect": () =>
      "Вывод команды никуда не перенаправлен — cron может слать письма или копить шум.\n" +
      "  >  перезаписывает файл (старые логи затираются)\n" +
      "  >> дописывает в конец файла\n" +
      "  2>&1 — отправить ошибки туда же, куда и вывод\n" +
      "Примеры: команда >/dev/null 2>&1   или   команда >>/var/log/script.log 2>&1",
    "stderr-not-redirected": () =>
      "stdout перенаправлен, а stderr — нет, ошибки потеряются.\n" +
      "Добавьте 2>&1 (ошибки пойдут туда же, куда вывод): … >>/var/log/script.log 2>&1",
    "bad-redirect": (tok: string) =>
      `Похоже на ошибку перенаправления «${tok}». Правильно, напр.: команда > /var/log/script.log 2>&1`,
    "field-syntax": (el: string, field: string) =>
      `Невалидное значение «${el}» в поле ${field}`,
    "zero-step": (field: string) => `Шаг /0 недопустим в поле ${field}`,
    "out-of-range": (value: string, field: string, min: number, max: number) =>
      `Значение ${value} вне диапазона ${field} (${min}-${max})`,
    "reversed-range": (a: string, b: string, field: string) =>
      `Подозрительный диапазон ${a}-${b} в поле ${field} (начало больше конца)`,

    "action.devnull": () => "Crontab: добавить >/dev/null 2>&1",
    "action.log": (name: string) =>
      `Crontab: добавить >>/var/log/${name}.log 2>&1`,
    "action.stderr": () => "Crontab: добавить 2>&1 (перенаправить stderr)",
    "action.php": () => "Crontab: вставить абсолютный путь /usr/bin/php",
    "action.explain": () => "Crontab: объяснить расписание",
    "action.convert": (macro: string) => `Crontab: преобразовать в ${macro}`,

    "completion.full": () => "Заполнить строку расписания cron",
    "msg.reboot": () => "При старте системы (reboot)",
    "msg.explainFail": () => "Не удалось разобрать расписание в этой строке.",
    "hover.label": () => "Cron",
    "detect.system": () => "system crontab (с user-полем)",
    "detect.user": () => "user crontab",
    "detect.summary": (p: any) =>
      `Формат: ${p.kind}; seconds=${p.seconds}, year=${p.year}. ` +
      `cron-строк: ${p.cron} (невалидных: ${p.bad}), макросов: ${p.macros}, ` +
      `env: ${p.env}, комментариев: ${p.comments}, строк с замечаниями: ${p.err}.`,
  },
  en: {
    "few-fields": (n: number) =>
      `Too few or invalid cron fields (expected ${n} schedule fields)`,
    "empty-command": () => "Empty command after the schedule",
    "unknown-macro": (m: string) => `Unknown macro ${m}`,
    "missing-user": () =>
      "System mode expects a user field after the schedule",
    "relative-path": () =>
      "Prefer absolute paths in cron, e.g. /usr/bin/php /var/www/site/script.php",
    "no-redirect": () =>
      "Command output is not redirected — cron may send mail or pile up noise.\n" +
      "  >  overwrites the file (old logs are wiped)\n" +
      "  >> appends to the end of the file\n" +
      "  2>&1 — send errors to the same place as the output\n" +
      "Examples: command >/dev/null 2>&1   or   command >>/var/log/script.log 2>&1",
    "stderr-not-redirected": () =>
      "stdout is redirected but stderr is not, so errors are lost.\n" +
      "Add 2>&1 (errors go where the output goes): … >>/var/log/script.log 2>&1",
    "bad-redirect": (tok: string) =>
      `Looks like a malformed redirection "${tok}". Correct form e.g.: command > /var/log/script.log 2>&1`,
    "field-syntax": (el: string, field: string) =>
      `Invalid value "${el}" in the ${field} field`,
    "zero-step": (field: string) => `Step /0 is not allowed in the ${field} field`,
    "out-of-range": (value: string, field: string, min: number, max: number) =>
      `Value ${value} is out of range for ${field} (${min}-${max})`,
    "reversed-range": (a: string, b: string, field: string) =>
      `Suspicious range ${a}-${b} in the ${field} field (start greater than end)`,

    "action.devnull": () => "Crontab: add >/dev/null 2>&1",
    "action.log": (name: string) => `Crontab: add >>/var/log/${name}.log 2>&1`,
    "action.stderr": () => "Crontab: add 2>&1 (redirect stderr)",
    "action.php": () => "Crontab: insert absolute /usr/bin/php",
    "action.explain": () => "Crontab: explain schedule",
    "action.convert": (macro: string) => `Crontab: convert to ${macro}`,

    "completion.full": () => "Fill the cron schedule line",
    "msg.reboot": () => "At system startup (reboot)",
    "msg.explainFail": () => "Could not parse the schedule on this line.",
    "hover.label": () => "Cron",
    "detect.system": () => "system crontab (with user field)",
    "detect.user": () => "user crontab",
    "detect.summary": (p: any) =>
      `Format: ${p.kind}; seconds=${p.seconds}, year=${p.year}. ` +
      `cron lines: ${p.cron} (invalid: ${p.bad}), macros: ${p.macros}, ` +
      `env: ${p.env}, comments: ${p.comments}, lines with notes: ${p.err}.`,
  },
};

export function t(locale: Locale, key: string, ...args: any[]): string {
  const fn = MESSAGES[locale]?.[key] ?? MESSAGES.en[key];
  return fn ? fn(...args) : key;
}
