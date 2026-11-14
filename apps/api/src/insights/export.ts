import { formatMinutes, ReportCell, ReportColumn, ReportDto } from '@vo/shared';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

/** "2026-11-14 09:05", in the company's time zone. */
function dateTime(iso: string, tz: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
}

/** Spreadsheet-friendly value: minutes become hours (2 decimals), times become local text. */
function sheetValue(c: ReportColumn, v: ReportCell, tz: string): string | number | null {
  if (v === null || v === undefined || v === '') return null;
  if (c.type === 'minutes') return typeof v === 'number' ? Math.round((v / 60) * 100) / 100 : v;
  if (c.type === 'datetime' && typeof v === 'string' && v.includes('T')) return dateTime(v, tz);
  return v;
}

/** Human value for PDF. */
function printValue(c: ReportColumn, v: ReportCell, tz: string): string {
  if (v === null || v === undefined) return '';
  if (c.type === 'minutes' && typeof v === 'number') return formatMinutes(v);
  if (c.type === 'datetime' && typeof v === 'string' && v.includes('T')) return dateTime(v, tz);
  return String(v);
}

const header = (c: ReportColumn) => (c.type === 'minutes' ? `${c.label} (hours)` : c.label);

/** Guards against spreadsheet formula injection: text starting with = + - @ is prefixed with '. */
const safe = (v: string | number | null) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export function toCsv(r: ReportDto): string {
  const esc = (v: string | number | null) => {
    if (v === null) return '';
    const s = String(safe(v));
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [r.columns.map((c) => esc(header(c))).join(',')];
  for (const row of r.rows) lines.push(r.columns.map((c) => esc(sheetValue(c, row[c.key], r.timezone))).join(','));
  if (r.totals) lines.push(r.columns.map((c) => esc(sheetValue(c, r.totals![c.key] ?? null, r.timezone))).join(','));
  // BOM so Excel opens UTF-8 names correctly
  return `﻿${lines.join('\r\n')}\r\n`;
}

export async function toXlsx(r: ReportDto, companyName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = `${companyName} Virtual Office`;
  wb.created = new Date(r.generatedAt);
  const ws = wb.addWorksheet(r.title.slice(0, 31), { views: [{ state: 'frozen', ySplit: 4 }] });
  ws.addRow([`${companyName}: ${r.title}`]).font = { bold: true, size: 14 };
  ws.addRow([`${r.subtitle} · times in ${r.timezone}`]).font = { color: { argb: 'FF555555' } };
  ws.addRow([]);
  const head = ws.addRow(r.columns.map(header));
  head.font = { bold: true };
  head.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF2F7' } };
    c.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
  });
  for (const row of r.rows) ws.addRow(r.columns.map((c) => safe(sheetValue(c, row[c.key], r.timezone))));
  if (r.totals) {
    const t = ws.addRow(r.columns.map((c) => safe(sheetValue(c, r.totals![c.key] ?? null, r.timezone))));
    t.font = { bold: true };
    t.eachCell((c) => (c.border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } }));
  }
  r.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    const longest = Math.max(header(c).length, ...r.rows.slice(0, 500).map((row) => String(sheetValue(c, row[c.key], r.timezone) ?? '').length));
    col.width = Math.min(48, Math.max(10, longest + 2));
    if (c.type === 'minutes') col.numFmt = '0.00';
  });
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: r.columns.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function toPdf(r: ReportDto, companyName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ bufferPages: true, size: 'A4', layout: r.columns.length > 6 ? 'landscape' : 'portrait', margin: 36, info: { Title: r.title, Author: `${companyName} Virtual Office` } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const bottom = () => doc.page.height - doc.page.margins.bottom - 18;
    // column widths: text columns get more room
    const weights = r.columns.map((c) => (c.type === 'text' ? (c.key === 'reason' || c.key === 'device' ? 2.2 : 1.6) : c.type === 'datetime' ? 1.3 : 1));
    const total = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / total) * width);
    const fontSize = r.columns.length > 8 ? 7.5 : 8.5;

    const title = () => {
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#111827').text(`${companyName}: ${r.title}`, left, doc.page.margins.top);
      doc.font('Helvetica').fontSize(9).fillColor('#4b5563').text(`${r.subtitle} · times in ${r.timezone}`);
      doc.moveDown(0.8);
    };
    const drawRow = (cells: string[], opts: { bold?: boolean; fill?: string }) => {
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
      const heights = cells.map((t, i) => doc.heightOfString(t, { width: widths[i] - 6 }));
      const h = Math.max(...heights) + 6;
      if (doc.y + h > bottom()) {
        doc.addPage();
        title();
        drawHeader();
        doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
      }
      const y = doc.y;
      if (opts.fill) doc.rect(left, y, width, h).fill(opts.fill);
      let x = left;
      cells.forEach((t, i) => {
        doc.fillColor('#111827').text(t, x + 3, y + 3, { width: widths[i] - 6, align: r.columns[i].type === 'text' || r.columns[i].type === 'datetime' || r.columns[i].type === 'date' ? 'left' : 'right' });
        x += widths[i];
      });
      doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.5).strokeColor('#e5e7eb').stroke();
      doc.y = y + h;
      doc.x = left;
    };
    const drawHeader = () => drawRow(r.columns.map((c) => c.label), { bold: true, fill: '#eff2f7' });

    title();
    drawHeader();
    if (!r.rows.length) doc.font('Helvetica').fontSize(10).fillColor('#4b5563').text('Nothing to show for this period.', left, doc.y + 8);
    r.rows.forEach((row, i) => drawRow(r.columns.map((c) => printValue(c, row[c.key], r.timezone)), { fill: i % 2 ? '#fafafa' : undefined }));
    if (r.totals) drawRow(r.columns.map((c) => printValue(c, r.totals![c.key] ?? null, r.timezone)), { bold: true });

    // page numbers
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0; // writing in the margin must not start a new page
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#6b7280')
        .text(`Page ${i + 1} of ${range.count} · generated ${dateTime(r.generatedAt, r.timezone)}`, left, doc.page.height - doc.page.margins.bottom - 4, { width, align: 'right', lineBreak: false });
      doc.page.margins.bottom = bottomMargin;
    }
    doc.end();
  });
}
