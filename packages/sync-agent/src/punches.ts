/** A punch as the server's /ingest/punches endpoint takes it: the device's own wall-clock time. */
export interface AgentPunch {
  deviceUserId: string;
  /** 'YYYY-MM-DD HH:MM:SS' as shown on the device */
  at: string;
  verify?: string;
}

const MONTHS: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * zkteco-js gives record_time as `Date.toString()` of a Date built from the device's wall clock,
 * e.g. "Thu Oct 01 2026 08:12:33 GMT+0800 (...)". Read the wall clock straight from the text.
 */
export function zkTime(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())} ${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}`;
  }
  if (typeof v !== 'string') return null;
  const m = v.match(/^\w{3} (\w{3}) (\d{2}) (\d{4}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m || !MONTHS[m[1]]) return null;
  return `${m[3]}-${MONTHS[m[1]]}-${m[2]} ${m[4]}:${m[5]}:${m[6]}`;
}

const VERIFY: Record<string, string> = { '0': 'Password', '1': 'Fingerprint', '2': 'Card', '3': 'Password', '4': 'Card', '15': 'Face', '25': 'Palm' };
const ATTLOG = /^\s*(\S+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s+(\d+))?(?:\s+(\d+))?/;

/** ZKTeco attlog lines: "PIN<TAB>YYYY-MM-DD HH:MM:SS<TAB>status<TAB>verify..." */
export function parseAttlog(text: string): AgentPunch[] {
  const out: AgentPunch[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(ATTLOG);
    if (!m) continue;
    const verify = m[7] !== undefined ? VERIFY[m[7]] : undefined;
    out.push({ deviceUserId: m[1], at: `${m[2]} ${pad(Number(m[3]))}:${m[4]}:${m[5] ?? '00'}`, ...(verify ? { verify } : {}) });
  }
  return out;
}

/** Wall-clock text compares correctly as a string. */
export const after = (p: AgentPunch, since: string | null) => !since || p.at >= since;
