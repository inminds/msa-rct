/**
 * excelService.ts
 *
 * Leitura e escrita do bcoDados.xlsx via exceljs (puro JS, sem Python).
 * O fallback para o helper Python foi removido — exceljs funciona em qualquer
 * ambiente (dev, Vercel, Railway, etc.).
 */
import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";
import { createRequire } from "module";

const _require = createRequire(import.meta.url);

// Mantido apenas para compatibilidade com código legado que importa PYTHON
export const PYTHON = process.env.PYTHON_PATH ?? "python";

const EXCEL_PATH = path.resolve(process.env.EXCEL_PATH ?? "bcoDados.xlsx");
const SHEET_NAME = "Plan1";

// Mapeamento coluna → cabeçalho (igual ao helper Python)
const COL_HEADERS: Record<number, string> = {
  1: "NCM",
  2: "NCM Econet",
  3: "Descrição",
  4: "PIS Cumulativo",
  5: "COFINS Cumulativo",
  6: "PIS Não Cumulativo",
  7: "COFINS Não Cumulativo",
  8: "Regime",
  9: "Legislação",
};

export interface NCMExcelRow {
  NCM: string;
  "NCM Econet": string;
  "Descrição": string;
  "PIS Cumulativo": string;
  "COFINS Cumulativo": string;
  "PIS Não Cumulativo": string;
  "COFINS Não Cumulativo": string;
  Regime: string;
  Legislação: string;
  [key: string]: string;
}

export interface NCMExcelFullRow {
  [key: string]: string;
}

function cellText(cell: ExcelJS.Cell): string {
  if (cell.value === null || cell.value === undefined) return "";
  if (typeof cell.value === "object" && "richText" in (cell.value as any)) {
    return (cell.value as ExcelJS.CellRichTextValue).richText
      .map((rt) => rt.text)
      .join("");
  }
  return String(cell.value);
}

export async function readNCMsFromExcel(): Promise<NCMExcelRow[]> {
  if (!fs.existsSync(EXCEL_PATH)) {
    console.warn("[excelService] bcoDados.xlsx não encontrado em:", EXCEL_PATH);
    return [];
  }
  try {
    // SheetJS (xlsx) é mais tolerante com arquivos Excel que têm features
    // avançadas (estilos, named ranges, etc.) que o exceljs não suporta.
    const XLSX = _require("xlsx");
    const wb = XLSX.readFile(EXCEL_PATH, { type: "file", cellText: false, cellDates: true });
    const sheetName = wb.SheetNames.includes(SHEET_NAME)
      ? SHEET_NAME
      : wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws) return [];

    const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

    const rows: NCMExcelRow[] = [];
    for (let i = 0; i < raw.length; i++) {
      const r = raw[i];
      const ncm = String(r[0] ?? "").trim();
      if (!ncm || ncm === "NCM") continue; // pula vazia ou cabeçalho
      rows.push({
        NCM: ncm,
        "NCM Econet": String(r[1] ?? ""),
        "Descrição": String(r[2] ?? ""),
        "PIS Cumulativo": String(r[3] ?? ""),
        "COFINS Cumulativo": String(r[4] ?? ""),
        "PIS Não Cumulativo": String(r[5] ?? ""),
        "COFINS Não Cumulativo": String(r[6] ?? ""),
        Regime: String(r[7] ?? ""),
        Legislação: String(r[8] ?? ""),
      });
    }
    return rows;
  } catch (err) {
    console.error("[excelService] Erro ao ler bcoDados.xlsx:", err);
    return [];
  }
}

export async function readNCMsFromExcelFull(): Promise<NCMExcelFullRow[]> {
  if (!fs.existsSync(EXCEL_PATH)) {
    console.warn("[excelService] bcoDados.xlsx não encontrado em:", EXCEL_PATH);
    return [];
  }
  try {
    const XLSX = _require("xlsx");
    const wb = XLSX.readFile(EXCEL_PATH, { type: "file", cellText: false, cellDates: true });
    const sheetName = wb.SheetNames.includes(SHEET_NAME)
      ? SHEET_NAME
      : wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws) return [];

    const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (raw.length === 0) return [];

    const headers = raw[0].map((h: any) => String(h ?? "").trim());
    const rows: NCMExcelFullRow[] = [];
    for (let i = 1; i < raw.length; i++) {
      const r = raw[i];
      const ncm = String(r[0] ?? "").trim();
      if (!ncm) continue;
      const entry: NCMExcelFullRow = {};
      headers.forEach((header, idx) => {
        if (!header) return;
        entry[header] = String(r[idx] ?? "");
      });
      rows.push(entry);
    }
    return rows;
  } catch (err) {
    console.error("[excelService] Erro ao ler bcoDados.xlsx completo:", err);
    return [];
  }
}

export interface HistoricoRow {
  "Data/Hora": string;
  NCM: string;
  Tipo: string;
  Campo: string;
  "Valor Anterior": string;
  "Valor Novo": string;
  [key: string]: string;
}

export async function readHistoricoFromExcel(): Promise<HistoricoRow[]> {
  if (!fs.existsSync(EXCEL_PATH)) {
    console.warn("[excelService] bcoDados.xlsx não encontrado.");
    return [];
  }
  try {
    const XLSX = _require("xlsx");
    const wb = XLSX.readFile(EXCEL_PATH, { type: "file", cellText: false, cellDates: true });

    // Procura sheet "Histórico" (pode ter encoding diferente)
    const sheetName = wb.SheetNames.find((n: string) =>
      n.toLowerCase().includes("hist")
    ) ?? "";
    if (!sheetName) return [];

    const ws = wb.Sheets[sheetName];
    const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (raw.length <= 1) return [];

    const rows: HistoricoRow[] = [];
    for (let i = 1; i < raw.length; i++) {
      const r = raw[i];
      const dataHora = String(r[0] ?? "").trim();
      if (!dataHora) continue;
      rows.push({
        "Data/Hora": dataHora,
        NCM: String(r[1] ?? ""),
        Tipo: String(r[2] ?? ""),
        Campo: String(r[3] ?? ""),
        "Valor Anterior": String(r[4] ?? "") || "(novo)",
        "Valor Novo": String(r[5] ?? ""),
      });
    }
    return rows;
  } catch (err) {
    console.error("[excelService] Erro ao ler sheet Histórico:", err);
    return [];
  }
}

export async function addNCMsToExcel(
  ncmCodes: string[]
): Promise<{ added: string[]; saved_to: string }> {
  if (ncmCodes.length === 0) return { added: [], saved_to: EXCEL_PATH };
  if (!fs.existsSync(EXCEL_PATH)) {
    console.warn("[excelService] bcoDados.xlsx não encontrado — NCMs não adicionados.");
    return { added: [], saved_to: EXCEL_PATH };
  }
  try {
    const XLSX = _require("xlsx");
    const wb = XLSX.readFile(EXCEL_PATH, { type: "file", cellText: false, cellDates: true });
    const sheetName = wb.SheetNames.includes(SHEET_NAME) ? SHEET_NAME : wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws) return { added: [], saved_to: EXCEL_PATH };

    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
    const existing = new Set<string>();
    for (let i = 1; i < rows.length; i++) {
      const ncm = String(rows[i]?.[0] ?? "").trim();
      if (ncm) existing.add(ncm.replace(/\D/g, ""));
    }

    const added: string[] = [];
    for (const code of ncmCodes) {
      const clean = code.replace(/\D/g, "");
      if (clean.length !== 8 || existing.has(clean)) continue;
      rows.push([clean]);
      existing.add(clean);
      added.push(clean);
    }

    if (added.length > 0) {
      const newWs = XLSX.utils.aoa_to_sheet(rows);
      wb.Sheets[sheetName] = newWs;
      XLSX.writeFile(wb, EXCEL_PATH);
    }
    return { added, saved_to: EXCEL_PATH };
  } catch (err) {
    console.error("[excelService] Erro ao adicionar NCMs ao Excel:", err);
    return { added: [], saved_to: EXCEL_PATH };
  }
}
