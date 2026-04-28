import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import type { NCMExcelRow, NCMExcelFullRow, HistoricoRow } from "./excelService";

const REPORTS_DIR = process.env.NODE_ENV === "production"
  ? "/tmp/reports"
  : path.resolve(".data/reports");

if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

export type ReportType = "tax-summary" | "ncm-analysis" | "trend-analysis" | "history-report";
export type ReportFormat = "xlsx" | "pdf";

export interface ReportRow { [key: string]: string | number }

function getDynamicHeaders(rows: ReportRow[]): string[] {
  if (rows.length === 0) return [];
  return Object.keys(rows[0]);
}

// ── Data builders ────────────────────────────────────────────────────────────

export function buildTaxSummaryData(rows: NCMExcelRow[]) {
  const filled = rows.filter(r => !!(r["PIS Cumulativo"] || r["PIS Não Cumulativo"]));
  const headers = ["NCM", "Descrição", "PIS Cumulativo", "COFINS Cumulativo", "PIS Não Cumulativo", "COFINS Não Cumulativo", "Regime"];
  const data = filled.map(r => headers.map(h => r[h] ?? ""));
  return { title: "Resumo Tributário", headers, data, total: rows.length, filled: filled.length };
}

export function buildNCMAnalysisData(rows: NCMExcelFullRow[]) {
  const headers = getDynamicHeaders(rows as unknown as ReportRow[]);
  const data = rows.map(r => headers.map(h => r[h] ?? ""));
  return { title: "Análise Detalhada de NCMs", headers, data };
}

export function buildTrendData(changes: any[]) {
  const headers = ["NCM", "Campo Alterado", "Valor Anterior", "Valor Novo", "Detectado Em", "Status"];
  const data = changes.map(c => [
    c.ncm ?? "",
    c.field ?? "",
    c.old_value ?? "",
    c.new_value ?? "",
    c.scan_date ? new Date(c.scan_date).toLocaleString("pt-BR") : "",
    c.status === "pending" ? "Pendente" : c.status === "accepted" ? "Aceito" : "Rejeitado",
  ]);
  return { title: "Análise de Tendências — Histórico de Mudanças", headers, data };
}

export function buildHistoricoData(rows: HistoricoRow[]) {
  const headers = ["Data/Hora", "NCM", "Tipo", "Campo", "Valor Anterior", "Valor Novo"];
  const data = rows.map(r => headers.map(h => r[h] ?? ""));
  return { title: "Histórico de Mudanças", headers, data };
}

// ── Excel generation ─────────────────────────────────────────────────────────

async function generateXlsx(
  reportId: string,
  reportName: string,
  title: string,
  headers: string[],
  data: (string | number)[][],
  extraInfo?: string
): Promise<string> {
  const filePath = path.join(REPORTS_DIR, `${reportId}.xlsx`);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MSA-RCT";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(title.slice(0, 31));

  // Title row
  sheet.mergeCells(1, 1, 1, headers.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = reportName;
  titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 28;

  // Date row
  sheet.mergeCells(2, 1, 2, headers.length);
  const dateCell = sheet.getCell(2, 1);
  dateCell.value = `Gerado em: ${new Date().toLocaleString("pt-BR")}${extraInfo ? " | " + extraInfo : ""}`;
  dateCell.font = { italic: true, size: 10, color: { argb: "FF6B7280" } };
  dateCell.alignment = { horizontal: "center" };
  sheet.getRow(2).height = 18;

  // Header row
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3B82F6" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FFBFDBFE" } } };
  });
  sheet.getRow(3).height = 20;

  // Data rows
  data.forEach((row, i) => {
    const excelRow = sheet.addRow(row);
    if (i % 2 === 0) {
      excelRow.eachCell(cell => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F9FF" } };
      });
    }
    excelRow.eachCell(cell => {
      cell.alignment = { vertical: "middle", wrapText: false };
    });
  });

  // Auto-width
  sheet.columns.forEach(col => {
    let max = 12;
    col.eachCell?.({ includeEmpty: false }, cell => {
      const len = String(cell.value ?? "").length;
      if (len > max) max = len;
    });
    col.width = Math.min(max + 2, 60);
  });

  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

// ── PDF generation ───────────────────────────────────────────────────────────

/**
 * Column weight table — determines proportional widths in the PDF.
 * Higher = wider. Columns not listed get weight 1.5.
 */
const COL_WEIGHTS: Record<string, number> = {
  "NCM":                    1.0,
  "Descrição":              4.5,
  "PIS Cumulativo":         1.3,
  "COFINS Cumulativo":      1.3,
  "PIS Não Cumulativo":     1.3,
  "COFINS Não Cumulativo":  1.3,
  "Regime":                 1.8,
  "Campo Alterado":         2.0,
  "Valor Anterior":         1.8,
  "Valor Novo":             1.8,
  "Detectado Em":           1.8,
  "Status":                 1.2,
  "Data/Hora":              1.8,
  "Tipo":                   1.2,
  "Campo":                  1.5,
};

/** Columns that may contain long text and should wrap to a second line. */
const WRAP_COLS = new Set(["Descrição", "Campo Alterado", "Valor Anterior", "Valor Novo"]);

/** Max characters before truncating even in wrap columns (keeps rows bounded). */
const MAX_WRAP_CHARS = 120;

function generatePdf(
  reportId: string,
  reportName: string,
  title: string,
  headers: string[],
  data: (string | number)[][],
  extraInfo?: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const filePath = path.join(REPORTS_DIR, `${reportId}.pdf`);
    const MARGIN = 40;
    const doc = new PDFDocument({ margin: MARGIN, size: "A4", layout: "landscape", bufferPages: true });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const pageW  = doc.page.width  - MARGIN * 2;   // usable width
    const pageH  = doc.page.height;
    const HEADER_BLOCK_H = 44;
    const TABLE_TOP      = HEADER_BLOCK_H + MARGIN + 8; // y where table starts
    const HDR_ROW_H      = 20;
    const DATA_ROW_H     = 30;   // enough for 1–2 lines
    const FOOTER_H       = 20;
    const PADDING        = 5;

    // ── Compute proportional column widths ──────────────────────────────────
    const weights   = headers.map(h => COL_WEIGHTS[h] ?? 1.5);
    const totalW    = weights.reduce((s, w) => s + w, 0);
    const colWidths = weights.map(w => Math.floor(pageW * w / totalW));
    // fix rounding drift on last column
    const drift = pageW - colWidths.reduce((s, w) => s + w, 0);
    colWidths[colWidths.length - 1] += drift;

    // ── x offset for each column ─────────────────────────────────────────────
    const colX = colWidths.reduce<number[]>((acc, w, i) => {
      acc.push(i === 0 ? MARGIN : acc[i - 1] + colWidths[i - 1]);
      return acc;
    }, []);

    // ── Draw the blue header block ───────────────────────────────────────────
    const drawHeaderBlock = () => {
      doc.rect(MARGIN, MARGIN, pageW, HEADER_BLOCK_H).fill("#1E40AF");
      doc.fillColor("white").fontSize(13).font("Helvetica-Bold")
        .text(reportName, MARGIN + 8, MARGIN + 10, { width: pageW - 16, lineBreak: false });
      const sub = `Gerado em: ${new Date().toLocaleString("pt-BR")}${extraInfo ? "  |  " + extraInfo : ""}`;
      doc.fillColor("#BFDBFE").fontSize(7.5).font("Helvetica")
        .text(sub, MARGIN + 8, MARGIN + 28, { width: pageW - 16, lineBreak: false });
    };

    // ── Draw column header row ───────────────────────────────────────────────
    const drawColumnHeaders = (y: number) => {
      doc.rect(MARGIN, y, pageW, HDR_ROW_H).fill("#2563EB");
      // vertical dividers
      colX.slice(1).forEach(x => {
        doc.moveTo(x, y).lineTo(x, y + HDR_ROW_H).stroke("#1D4ED8");
      });
      headers.forEach((h, i) => {
        doc.fillColor("white").fontSize(7.5).font("Helvetica-Bold")
          .text(h, colX[i] + PADDING, y + 6, { width: colWidths[i] - PADDING * 2, lineBreak: false, ellipsis: true });
      });
      return y + HDR_ROW_H;
    };

    // ── Draw a single data row ───────────────────────────────────────────────
    const drawDataRow = (cells: (string | number)[], rowIndex: number, y: number): number => {
      const isAlt = rowIndex % 2 === 0;
      doc.rect(MARGIN, y, pageW, DATA_ROW_H).fill(isAlt ? "#F0F9FF" : "#FFFFFF");

      // bottom border line
      doc.moveTo(MARGIN, y + DATA_ROW_H)
        .lineTo(MARGIN + pageW, y + DATA_ROW_H)
        .strokeColor("#E2E8F0").lineWidth(0.5).stroke();

      // vertical dividers
      colX.slice(1).forEach(x => {
        doc.moveTo(x, y).lineTo(x, y + DATA_ROW_H)
          .strokeColor("#E2E8F0").lineWidth(0.5).stroke();
      });

      cells.forEach((cell, i) => {
        const raw  = String(cell ?? "");
        const isWrap = WRAP_COLS.has(headers[i]);
        const text = isWrap && raw.length > MAX_WRAP_CHARS
          ? raw.slice(0, MAX_WRAP_CHARS) + "…"
          : raw;
        const textY = isWrap ? y + 5 : y + (DATA_ROW_H - 8) / 2;  // centre single-line

        // value colour: green for %, gray for "—" / empty
        const isPercent = /^\d[\d,.]*\s*%$/.test(text.trim());
        const isEmpty   = text.trim() === "" || text === "—";
        const color     = isEmpty ? "#9CA3AF" : isPercent ? "#15803D" : "#111827";

        doc.fillColor(color).fontSize(7.5).font("Helvetica")
          .text(text, colX[i] + PADDING, textY, {
            width:     colWidths[i] - PADDING * 2,
            lineBreak: isWrap,
            height:    DATA_ROW_H - 8,
            ellipsis:  true,
          });
      });

      return y + DATA_ROW_H;
    };

    // ── Main render loop ─────────────────────────────────────────────────────
    let y = TABLE_TOP;
    let pageNum = 0;

    const newPage = (isFirst = false) => {
      if (!isFirst) doc.addPage({ size: "A4", layout: "landscape" });
      pageNum++;
      drawHeaderBlock();
      y = drawColumnHeaders(TABLE_TOP);
    };

    newPage(true);

    data.forEach((row, rowIndex) => {
      if (y + DATA_ROW_H > pageH - FOOTER_H - 10) newPage();
      y = drawDataRow(row, rowIndex, y);
    });

    // outer border around the whole table area (first page only — good enough)
    // ── Footers ──────────────────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.fillColor("#9CA3AF").fontSize(6.5).font("Helvetica")
        .text(
          `MSA-RCT  •  ${title}  •  Página ${i + 1} de ${range.count}`,
          MARGIN, pageH - 18,
          { width: pageW, align: "center" }
        );
    }

    doc.end();
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function generateReportFile(
  reportId: string,
  reportName: string,
  type: ReportType,
  format: ReportFormat,
  excelRows: NCMExcelRow[],
  changes: any[],
  historicoRows?: HistoricoRow[]
): Promise<string> {
  let title: string;
  let headers: string[];
  let data: (string | number)[][];
  let extraInfo: string | undefined;

  if (type === "tax-summary") {
    const d = buildTaxSummaryData(excelRows);
    title = d.title;
    headers = d.headers;
    data = d.data;
    extraInfo = `Total: ${d.total} NCMs | Preenchidos: ${d.filled}`;
  } else if (type === "ncm-analysis") {
    const d = buildNCMAnalysisData(excelRows as unknown as NCMExcelFullRow[]);
    title = d.title;
    headers = d.headers;
    data = d.data;
  } else if (type === "history-report") {
    const d = buildHistoricoData(historicoRows ?? []);
    title = d.title;
    headers = d.headers;
    data = d.data;
    extraInfo = `${d.data.length} registro(s)`;
  } else {
    const d = buildTrendData(changes);
    title = d.title;
    headers = d.headers;
    data = d.data;
    extraInfo = `${changes.length} mudança(s) detectada(s)`;
  }

  if (format === "xlsx") {
    return generateXlsx(reportId, reportName, title, headers, data, extraInfo);
  } else {
    return generatePdf(reportId, reportName, title, headers, data, extraInfo);
  }
}

export function getPreviewData(
  type: ReportType,
  excelRows: NCMExcelRow[],
  changes: any[],
  historicoRows?: HistoricoRow[]
): { title: string; headers: string[]; data: (string | number)[][] } {
  if (type === "tax-summary") return buildTaxSummaryData(excelRows);
  if (type === "ncm-analysis") return buildNCMAnalysisData(excelRows as unknown as NCMExcelFullRow[]);
  if (type === "history-report") return buildHistoricoData(historicoRows ?? []);
  return buildTrendData(changes);
}
