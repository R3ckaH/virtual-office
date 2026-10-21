import ExcelJS from 'exceljs';
import { normalizeDateTime, parseAttendanceFile, parseAttlog } from './parsers';

describe('device log parsers', () => {
  it('reads date/time spellings', () => {
    expect(normalizeDateTime('2026-10-01 08:12:33')).toBe('2026-10-01 08:12:33');
    expect(normalizeDateTime('2026/10/01', '8:12')).toBe('2026-10-01 08:12:00');
    expect(normalizeDateTime('10/1/2026 8:12 PM')).toBe('2026-10-01 20:12:00');
    expect(normalizeDateTime('10/01/2026 12:05:09 AM')).toBe('2026-10-01 00:05:09');
    expect(normalizeDateTime('2026-10-01T08:12:33')).toBe('2026-10-01 08:12:33');
    expect(normalizeDateTime('13/45/2026 8:00')).toBeNull();
    expect(normalizeDateTime('yesterday')).toBeNull();
  });

  it('reads a ZKTeco attlog (.dat) with verify codes, and reports bad lines', () => {
    const r = parseAttlog('    0047\t2026-10-01 08:12:33\t0\t1\t0\t0\n0041\t2026-10-01 10:21:02\t0\t15\t0\t0\n\ngarbage line\n');
    expect(r.rows).toEqual([
      { deviceUserId: '0047', local: '2026-10-01 08:12:33', verify: 'Fingerprint' },
      { deviceUserId: '0041', local: '2026-10-01 10:21:02', verify: 'Face' },
    ]);
    expect(r.errors).toHaveLength(1);
  });

  it('reads a ZK software tab-separated export (EnNo + DateTime)', async () => {
    const txt = 'No\tMchn\tEnNo\tName\tMode\tIOMd\tDateTime\n1\t1\t12\tMaria\t1\t0\t2026/10/01  07:52:10\n2\t1\t15\tCarlo\t1\t0\t2026/10/01  07:49:02\n';
    const r = await parseAttendanceFile(Buffer.from(txt), 'GLG_001.TXT');
    expect(r.rows.map((x) => [x.deviceUserId, x.local, x.verify])).toEqual([
      ['12', '2026-10-01 07:52:10', 'Fingerprint'],
      ['15', '2026-10-01 07:49:02', 'Fingerprint'],
    ]);
  });

  it('reads a CSV with separate date and time columns and quoted names', async () => {
    const csv = '\uFEFFAC-No.,Name,Date,Time\r\n0021,"Lim, Grace",10/01/2026,7:58 AM\r\n0021,"Lim, Grace",10/01/2026,10:05 AM\r\n';
    const r = await parseAttendanceFile(Buffer.from(csv), 'export.csv');
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.local)).toEqual(['2026-10-01 07:58:00', '2026-10-01 10:05:00']);
  });

  it('explains missing columns', async () => {
    const r = await parseAttendanceFile(Buffer.from('Name,Something\nA,B\n'), 'x.csv');
    expect(r.rows).toEqual([]);
    expect(r.errors[0]).toMatch(/Couldn’t find the columns/);
  });

  it('reads an Excel export', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Log');
    ws.addRow(['User ID', 'Check Time', 'Verify Type']);
    ws.addRow(['0033', new Date(Date.UTC(2026, 9, 1, 8, 31, 5)), 'Face']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const r = await parseAttendanceFile(buf, 'log.xlsx');
    expect(r.rows).toEqual([{ deviceUserId: '0033', local: '2026-10-01 08:31:05', verify: 'Face' }]);
  });

  it('rejects other file types', async () => {
    expect((await parseAttendanceFile(Buffer.from('x'), 'photo.png')).errors[0]).toMatch(/Use a .dat/);
  });
});
