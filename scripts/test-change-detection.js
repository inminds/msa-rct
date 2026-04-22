/**
 * Script de teste para detecção de mudanças em NCMs.
 *
 * Simula o que o schedulerService faz após uma varredura:
 * lê o Excel como "estado atual" e cria um "estado anterior"
 * artificial com alguns campos alterados, inserindo os registros
 * de mudança em ncm_changes.
 *
 * Uso:
 *   node scripts/test-change-detection.js
 */

import Database from "better-sqlite3";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Detecta Python (mesmo helper do excelService)
async function findPython() {
  const candidates = [
    "python",
    "python3",
    `${process.env.LOCALAPPDATA}\\Programs\\Python\\Python313\\python.exe`,
    `${process.env.LOCALAPPDATA}\\Programs\\Python\\Python312\\python.exe`,
    `${process.env.LOCALAPPDATA}\\Programs\\Python\\Python311\\python.exe`,
    `${process.env.LOCALAPPDATA}\\Programs\\Python\\Python310\\python.exe`,
  ];
  for (const p of candidates) {
    try {
      await execFileAsync(p, ["--version"]);
      return p;
    } catch { /* try next */ }
  }
  return "python";
}

async function readExcel(python) {
  const { stdout } = await execFileAsync(python, ["excel_helper.py", "read"], { cwd: ROOT });
  return JSON.parse(stdout);
}

async function main() {
  console.log("🔍 Lendo Excel atual...");
  const python = await findPython();
  const rows = await readExcel(python);

  const filled = rows.filter(r => r["PIS Cumulativo"] || r["PIS Não Cumulativo"]);
  if (filled.length === 0) {
    console.log("❌ Nenhum NCM preenchido encontrado no Excel. Execute uma varredura primeiro.");
    process.exit(1);
  }

  // Simular mudanças artificiais: pega os 2 primeiros NCMs preenchidos
  // e cria "antes" com valores ligeiramente diferentes
  const targets = filled.slice(0, 2);
  const FAKE_CHANGES = [
    { field: "PIS Cumulativo",      fakeOldValue: "9,99%"       },
    { field: "COFINS Cumulativo",   fakeOldValue: "15,00%"      },
    { field: "Regime",              fakeOldValue: "Monofásico Teste" },
  ];

  const db = new Database(path.join(ROOT, ".data/dev.db"));
  const stmt = db.prepare(
    "INSERT INTO ncm_changes (ncm, field, old_value, new_value, status, scan_date) VALUES (?, ?, ?, ?, 'pending', ?)"
  );

  const scanDate = new Date().toISOString();
  let inserted = 0;

  for (const row of targets) {
    const ncm = row["NCM"];
    for (const { field, fakeOldValue } of FAKE_CHANGES) {
      const realValue = row[field];
      if (!realValue) continue; // pula campos vazios
      // Só insere se o valor "fake" for diferente do real
      if (fakeOldValue !== realValue) {
        stmt.run(ncm, field, fakeOldValue, realValue, scanDate);
        console.log(`  ✅ NCM ${ncm} | ${field}: "${fakeOldValue}" → "${realValue}"`);
        inserted++;
      }
    }
  }

  db.close();

  if (inserted === 0) {
    console.log("⚠️  Nenhuma mudança inserida (valores já eram iguais).");
  } else {
    console.log(`\n✅ ${inserted} mudança(s) de teste inserida(s) em ncm_changes.`);
    console.log("👉 Abra a tela 'Mudanças em NCMs' no sistema para ver os resultados.\n");
  }
}

main().catch(err => { console.error("Erro:", err); process.exit(1); });
