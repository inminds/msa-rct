/**
 * Script de teste REAL para detecção de mudanças em NCMs.
 *
 * Faz o ciclo completo que o schedulerService executa:
 *  1. Lê o Excel → salva snapshot ("antes")
 *  2. Altera um campo de um NCM no Excel (simula o scraper mudando o valor)
 *  3. Relê o Excel → "depois"
 *  4. Compara antes vs depois → detecta mudanças
 *  5. Salva em ncm_changes
 *  6. Restaura o valor original no Excel (limpeza)
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

const COMPARE_FIELDS = [
  "PIS Cumulativo",
  "COFINS Cumulativo",
  "PIS Não Cumulativo",
  "COFINS Não Cumulativo",
  "Regime",
];

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
    try { await execFileAsync(p, ["--version"]); return p; }
    catch { /* try next */ }
  }
  return "python";
}

async function readExcel(python) {
  const { stdout } = await execFileAsync(python, ["excel_helper.py", "read"], { cwd: ROOT });
  return JSON.parse(stdout);
}

async function restoreField(python, ncm, field, value) {
  await execFileAsync(python, ["excel_helper.py", "restore", ncm, field, value], { cwd: ROOT });
}

async function main() {
  const python = await findPython();
  console.log(`🐍 Python: ${python}\n`);

  // ── Passo 1: snapshot "antes" ─────────────────────────────────────────────
  console.log("📖 Passo 1: lendo Excel (snapshot ANTES)...");
  const before = await readExcel(python);
  const filled = before.filter(r => r["PIS Cumulativo"] || r["PIS Não Cumulativo"]);

  if (filled.length === 0) {
    console.log("❌ Nenhum NCM preenchido encontrado. Execute uma varredura primeiro.");
    process.exit(1);
  }

  // Usa o primeiro NCM preenchido como alvo
  const target = filled[0];
  const ncm = target["NCM"];
  const field = "PIS Cumulativo";
  const originalValue = target[field];

  if (!originalValue) {
    console.log(`❌ NCM ${ncm} não tem valor em "${field}". Escolha outro NCM.`);
    process.exit(1);
  }

  console.log(`   NCM alvo: ${ncm}`);
  console.log(`   Campo:    ${field}`);
  console.log(`   Valor atual (original): "${originalValue}"\n`);

  // ── Passo 2: altera o campo no Excel (simula scraper escrevendo novo valor) ─
  const fakeNewValue = "TEST_99,99%";
  console.log(`✏️  Passo 2: alterando "${field}" de "${originalValue}" para "${fakeNewValue}" no Excel...`);
  await restoreField(python, ncm, field, fakeNewValue);
  console.log("   Excel atualizado.\n");

  // ── Passo 3: relê o Excel ("depois") ─────────────────────────────────────
  console.log("📖 Passo 3: relendo Excel (snapshot DEPOIS)...");
  const after = await readExcel(python);
  const afterMap = new Map(after.map(r => [r["NCM"], r]));

  // ── Passo 4: comparação antes vs depois ───────────────────────────────────
  console.log("🔎 Passo 4: comparando antes vs depois...");
  const changes = [];
  const scanDate = new Date().toISOString();

  for (const oldRow of filled) {
    const newRow = afterMap.get(oldRow["NCM"]);
    if (!newRow) continue;
    for (const f of COMPARE_FIELDS) {
      const oldVal = (oldRow[f] ?? "").trim();
      const newVal = (newRow[f] ?? "").trim();
      if (oldVal !== newVal) {
        changes.push({ ncm: oldRow["NCM"], field: f, oldValue: oldVal, newValue: newVal });
        console.log(`   ✅ Mudança: NCM ${oldRow["NCM"]} | ${f}: "${oldVal}" → "${newVal}"`);
      }
    }
  }

  if (changes.length === 0) {
    console.log("   ⚠️  Nenhuma mudança detectada na comparação.");
  }

  // ── Passo 5: salva em ncm_changes ─────────────────────────────────────────
  if (changes.length > 0) {
    console.log(`\n💾 Passo 5: salvando ${changes.length} mudança(s) em ncm_changes...`);
    const db = new Database(path.join(ROOT, ".data/dev.db"));
    const stmt = db.prepare(
      "INSERT INTO ncm_changes (ncm, field, old_value, new_value, status, scan_date) VALUES (?, ?, ?, ?, 'pending', ?)"
    );
    for (const c of changes) stmt.run(c.ncm, c.field, c.oldValue, c.newValue, scanDate);
    db.close();
    console.log("   Salvo com sucesso.");
  }

  // ── Passo 6: restaura o valor original no Excel (limpeza) ─────────────────
  console.log(`\n🔄 Passo 6: restaurando valor original "${originalValue}" no Excel...`);
  await restoreField(python, ncm, field, originalValue);
  console.log("   Excel restaurado.\n");

  console.log("═══════════════════════════════════════════════════════");
  console.log(`✅ Teste concluído! ${changes.length} mudança(s) inserida(s) em ncm_changes.`);
  console.log("👉 Abra a tela 'Mudanças em NCMs' no sistema para verificar.");
  console.log("═══════════════════════════════════════════════════════\n");
}

main().catch(err => { console.error("Erro:", err); process.exit(1); });
