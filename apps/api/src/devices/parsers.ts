/**
 * Reads attendance logs exported from biometric devices or their PC software:
 *  - ZKTeco-style attlog .dat/.txt: "PIN<TAB>YYYY-MM-DD HH:MM:SS<TAB>status<TAB>verify..."
 *  - CSV / tab-separated text with a header row (e.g. "EnNo ... DateTime", "AC-No.,Name,Time")
 *  - Excel .xlsx with the same kinds of columns
 * Output times are the device's local wall-clock ('YYYY-MM-DD HH:MM:SS'); the caller applies the device's time zone.
 */
import ExcelJS from 'exceljs';

export interface ParsedPunch {
  deviceUserId: string;
  local: string;
  verify: string | null;
}

export interface ParseResult {
  rows: ParsedPunch[];
  errors: string[];
}

/** ZKTeco verify codes (most rebrands use the same numbers). */
export const VERIFY_LABELS: Record<string, string> = {
  '0': 'Password',
  '1': 'Fingerprint',
  '2': 'Card',
  '3': 'Password',
  '4': 'Card',
  '15': 'Face',
  '25': 'Palm',
};

export const verifyLabel = (v: string | number | null | undefined): string | null => {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  return VERIFY_LABELS[s] ?? (/^\d+$/.test(s) ? null : s);
};

const pad = (n: number | string) => String(n).padStart(2, '0');
const MAX_ERRORS = 20;

/** Normalizes many date/time spellings to 'YYYY-MM-DD HH:MM:SS'. Slash dates are read month first (MM/DD/YYYY). */
export function normalizeDateTime(dateText: string, timeText?: string): string | null {
  const raw = `${dateText}${timeText ? ` ${timeText}` : ''}`.trim().replace('T', ' ').replace(/\s+/g, ' ');
  let y: number, mo: number, d: number, rest: string;
  let m = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s*(.*)$/);
  if (m) {
    [y, mo, d, rest] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4]];
  } else if ((m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(.*)$/))) {
    [mo, d, y, rest] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4]];
  } else return null;
  const t = rest.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*([AaPp][Mm])?(?:\s*[Zz]|[+-]\d{2}:?\d{2})?$/);
  if (!t) return null;
  let h = Number(t[1]);
  const mi = Number(t[2]);
  const s = Number(t[3] ?? 0);
  const ampm = t[4]?.toUpperCase();
  if (ampm) {
    if (h < 1 || h > 12) return null;
    if (ampm === 'AM' && h === 12) h = 0;
    if (ampm === 'PM' && h !== 12) h += 12;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  return `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(s)}`;
}

const ATTLOG = /^\s*(\S+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2}(?::\d{2})?)(?:\s+(\d+))?(?:\s+(\d+))?/;

/** Parses ATTLOG lines (also used for the ADMS push body). */
export function parseAttlog(text: string): ParseResult {
  const rows: ParsedPunch[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const m = line.match(ATTLOG);
    const local = m ? normalizeDateTime(m[2], m[3]) : null;
    if (!m || !local) {
      if (errors.length < MAX_ERRORS) errors.push(`Line ${i + 1}: couldn’t read “${line.trim().slice(0, 60)}”`);
      return;
    }
    rows.push({ deviceUserId: m[1], local, verify: verifyLabel(m[5]) });
  });
  return { rows, errors };
}

const ID_HEADERS = [/^en\s*no\.?$/i, /^ac[-\s]?no\.?$/i, /^(user|employee|staff|person)\s*(id|no\.?|number|code)$/i, /^enroll(ment)?\s*(id|no\.?|number)?$/i, /^pin$/i, /^badge(\s*(id|no\.?))?$/i, /^(card|id)\s*(no\.?|number)?$/i, /^id$/i];
const DATETIME_HEADERS = [/^date\s*\/?\s*time$/i, /^(check|punch|clock|log|record)\s*(in\s*)?time$/i, /^time\s*stamp$/i, /^time$/i];
const DATE_HEADERS = [/^date$/i, /^(check|punch|log)\s*date$/i];
const TIME_ONLY_HEADERS = [/^time$/i, /^(check|punch|clock)\s*time$/i];
const VERIFY_HEADERS = [/^verify(\s*(mode|type|code))?$/i, /^mode$/i, /^verification$/i];

function findColumn(headers: string[], patterns: RegExp[], skip: number[] = []): number {
  for (const re of patterns) {
    const i = headers.findIndex((h, idx) => !skip.includes(idx) && re.test(h.trim()));
    if (i >= 0) return i;
  }
  return -1;
}

/** Parses a table (array of rows) whose first meaningful row is a header. */
export function parseTable(table: string[][]): ParseResult {
  const errors: string[] = [];
  const rows: ParsedPunch[] = [];
  const headerIdx = table.findIndex((r) => r.some((c) => c.trim()));
  if (headerIdx < 0) return { rows, errors: ['The file is empty'] };
  const headers = table[headerIdx].map((h) => h.trim());
  const idCol = findColumn(headers, ID_HEADERS);
  const dateCol = findColumn(headers, DATE_HEADERS);
  let dtCol = findColumn(headers, DATETIME_HEADERS);
  let timeCol = -1;
  if (dateCol >= 0) {
    timeCol = findColumn(headers, TIME_ONLY_HEADERS, [dateCol]);
    if (timeCol >= 0) dtCol = -1;
  }
  const verifyCol = findColumn(headers, VERIFY_HEADERS);
  if (idCol < 0 || (dtCol < 0 && !(dateCol >= 0 && timeCol >= 0))) {
    return {
      rows,
      errors: [
        `Couldn’t find the columns. Expected a user ID column (like “User ID”, “AC-No.” or “EnNo”) and a date/time column (like “DateTime” or “Date” + “Time”). Found: ${headers.join(', ')}`,
      ],
    };
  }
  for (let i = headerIdx + 1; i < table.length; i++) {
    const r = table[i];
    if (!r.some((c) => c.trim())) continue;
    const id = (r[idCol] ?? '').trim();
    const local = dtCol >= 0 ? normalizeDateTime(r[dtCol] ?? '') : normalizeDateTime(r[dateCol] ?? '', r[timeCol] ?? '');
    if (!id || !local) {
      if (errors.length < MAX_ERRORS) errors.push(`Row ${i + 1}: missing user ID or unreadable date/time`);
      continue;
    }
    rows.push({ deviceUserId: id, local, verify: verifyCol >= 0 ? verifyLabel(r[verifyCol]) : null });
  }
  return { rows, errors };
}

/** Minimal CSV/TSV reader with quoted fields. */
export function splitDelimited(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = first.includes('\t') ? '\t' : first.split(';').length > first.split(',').length ? ';' : ',';
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out;
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    // exceljs gives the sheet's wall-clock time as a UTC date
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())} ${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}`;
  }
  if (typeof v === 'object') {
    if ('result' in v && v.result !== undefined) return cellText(v.result as ExcelJS.CellValue);
    if ('text' in v) return String(v.text);
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
  }
  return String(v);
}

export async function parseAttendanceFile(buf: Buffer, filename: string): Promise<ParseResult> {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (ext === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
    } catch {
      return { rows: [], errors: ['That doesn’t look like a valid .xlsx file'] };
    }
    const ws = wb.worksheets[0];
    if (!ws) return { rows: [], errors: ['The workbook has no sheets'] };
    const table: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = row.values as ExcelJS.CellValue[];
      table.push(vals.slice(1).map(cellText));
    });
    return parseTable(table);
  }
  if (!['dat', 'txt', 'csv', 'log'].includes(ext)) {
    return { rows: [], errors: ['Use a .dat, .txt, .csv or .xlsx file exported by the device or its software'] };
  }
  const text = buf.toString('utf8').replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  if (ATTLOG.test(firstLine)) return parseAttlog(text);
  return parseTable(splitDelimited(text));
}
