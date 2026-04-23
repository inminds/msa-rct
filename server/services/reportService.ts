import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import type { NCMExcelRow } from "./excelService";

const REPORTS_DIR = path.resolve(".data/reports");

if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

export type ReportType = "tax-summary" | "ncm-analysis" | "trend-analysis";
export type ReportFormat = "xlsx" | "pdf";

export interface ReportRow { [key: string]: string | number }

// ── Data builders ────────────────────────────────────────────────────────────

export function buildTaxSummaryData(rows: NCMExcelRow[]) {
  const filled = rows.filter(r => !!(r["PIS Cumulativo"] || r["PIS Não Cumulativo"]));
  const headers = ["NCM", "Descrição", "PIS Cumulativo", "COFINS Cumulativo", "PIS Não Cumulativo", "COFINS Não Cumulativo", "Regime"];
  const data = filled.map(r => headers.map(h => r[h] ?? ""));
  return { title: "Resumo Tributário", headers, data, total: rows.length, filled: filled.length };
}

export function buildNCMAnalysisData(rows: NCMExcelRow[]) {
  const headers = ["NCM", "NCM Econet", "Descrição", "PIS Cumulativo", "COFINS Cumulativo", "PIS Não Cumulativo", "COFINS Não Cumulativo", "Regime", "Legislação"];
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
    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const pageW = doc.page.width - 80;
    const colW = Math.floor(pageW / headers.length);

    // Header block
    doc.rect(40, 40, pageW, 36).fill("#1E40AF");
    doc.fillColor("white").fontSize(14).font("Helvetica-Bold")
      .text(reportName, 48, 50, { width: pageW - 16 });
    doc.fillColor("#93C5FD").fontSize(8).font("Helvetica")
      .text(`Gerado em: ${new Date().toLocaleString("pt-BR")}${extraInfo ? " | " + extraInfo : ""}`, 48, 66);

    let y = 90;

    const drawRow = (cells: (string | number)[], isHeader = false, isAlt = false) => {
      if (y > doc.page.height - 60) {
        doc.addPage({ size: "A4", layout: "landscape" });
        y = 40;
      }
      const rowH = 18;
      if (isHeader) {
        doc.rect(40, y, pageW, rowH).fill("#3B82F6");
      } else if (isAlt) {
        doc.rect(40, y, pageW, rowH).fill("#F0F9FF");
      }
      cells.forEach((cell, i) => {
        const x = 40 + i * colW;
        doc.fillColor(isHeader ? "white" : "#111827")
          .fontSize(isHeader ? 8 : 7.5)
          .font(isHeader ? "Helvetica-Bold" : "Helvetica")
          .text(String(cell ?? ""), x + 4, y + 5, { width: colW - 8, lineBreak: false, ellipsis: true });
      });
      y += rowH;
    };

    drawRow(headers, true);
    data.forEach((row, i) => drawRow(row, false, i % 2 === 0));

    // Footer
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.fillColor("#9CA3AF").fontSize(7).font("Helvetica")
        .text(`MSA-RCT — ${title} — Página ${i + 1} de ${range.count}`,
          40, doc.page.height - 25, { width: pageW, align: "center" });
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
  changes: any[]
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
    const d = buildNCMAnalysisData(excelRows);
    title = d.title;
    headers = d.headers;
    data = d.data;
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
  changes: any[]
): { title: string; headers: string[]; data: (string | number)[][] } {
  if (type === "tax-summary") return buildTaxSummaryData(excelRows);
  if (type === "ncm-analysis") return buildNCMAnalysisData(excelRows);
  return buildTrendData(changes);
}
