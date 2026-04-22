import cron from "node-cron";
import { spawn } from "child_process";
import path from "path";
import { db } from "../db";
import { scanSchedule, type ScanSchedule } from "@shared/schema";
import { eq } from "drizzle-orm";
import { PYTHON, readNCMsFromExcel } from "./excelService";
import { setActivePid } from "./scanState";

let activeJob: cron.ScheduledTask | null = null;

// Fields to compare for change detection
const COMPARE_FIELDS = [
  "PIS Cumulativo",
  "COFINS Cumulativo",
  "PIS Não Cumulativo",
  "COFINS Não Cumulativo",
  "Regime",
];

function isPreenchido(row: Record<string, string>): boolean {
  return !!(row["PIS Cumulativo"] || row["PIS Não Cumulativo"]);
}

async function detectAndSaveChanges(
  before: Record<string, string>[],
  after: Record<string, string>[]
) {
  try {
    const filledBefore = before.filter(isPreenchido);
    if (filledBefore.length === 0) return;

    // Build lookup map for "after" by NCM code
    const afterMap = new Map<string, Record<string, string>>();
    for (const row of after) {
      if (row["NCM"]) afterMap.set(row["NCM"], row);
    }

    const changes: { ncm: string; field: string; oldValue: string; newValue: string }[] = [];
    const scanDate = new Date().toISOString();

    for (const oldRow of filledBefore) {
      const ncm = oldRow["NCM"];
      const newRow = afterMap.get(ncm);
      if (!newRow) continue;

      for (const field of COMPARE_FIELDS) {
        const oldVal = (oldRow[field] ?? "").trim();
        const newVal = (newRow[field] ?? "").trim();
        if (oldVal !== newVal) {
          changes.push({ ncm, field, oldValue: oldVal, newValue: newVal });
        }
      }
    }

    if (changes.length === 0) {
      console.log("[scheduler] Nenhuma mudança detectada nos NCMs preenchidos.");
      return;
    }

    // Save to ncm_changes table using better-sqlite3 directly
    const Database = (await import("better-sqlite3")).default;
    const sqliteDb = new Database(".data/dev.db");
    const stmt = sqliteDb.prepare(
      "INSERT INTO ncm_changes (ncm, field, old_value, new_value, status, scan_date) VALUES (?, ?, ?, ?, 'pending', ?)"
    );
    for (const c of changes) {
      stmt.run(c.ncm, c.field, c.oldValue, c.newValue, scanDate);
    }
    sqliteDb.close();

    console.log(`[scheduler] ${changes.length} mudança(s) detectada(s) e salva(s) em ncm_changes.`);
  } catch (err) {
    console.error("[scheduler] Erro ao detectar/salvar mudanças:", err);
  }
}

function buildCronExpression(config: ScanSchedule): string {
  const m = config.minute ?? 0;
  const h = config.hour ?? 8;
  if (config.frequency === "monthly") {
    const dom = config.dayOfMonth ?? 1;
    return `${m} ${h} ${dom} * *`;
  }
  // weekly (default)
  const dow = config.dayOfWeek ?? 1;
  return `${m} ${h} * * ${dow}`;
}

async function runScraper(mode: string) {
  const args = ["econet_scraper.py", ...(mode === "todos" ? ["--todos"] : [])];

  // Snapshot before scan — only filled NCMs
  let snapshot: Record<string, string>[] = [];
  try {
    snapshot = await readNCMsFromExcel();
  } catch (err) {
    console.error("[scheduler] Erro ao ler Excel antes da varredura:", err);
  }

  const child = spawn(PYTHON, args, {
    cwd: path.resolve("."),
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
    stdio: "ignore",
    // NOT detached — we need to listen to exit event
  });

  if (child.pid) setActivePid(child.pid);
  console.log(`[scheduler] Varredura automática disparada (pid: ${child.pid}, mode: ${mode})`);

  child.on("exit", async (code) => {
    setActivePid(null);
    console.log(`[scheduler] Scraper finalizado (code: ${code})`);

    if (snapshot.length > 0) {
      try {
        const after = await readNCMsFromExcel();
        await detectAndSaveChanges(snapshot, after);
      } catch (err) {
        console.error("[scheduler] Erro ao ler Excel após varredura:", err);
      }
    }
  });

  child.on("error", (err) => {
    setActivePid(null);
    console.error("[scheduler] Erro ao iniciar scraper:", err);
  });
}

export function applySchedule(config: ScanSchedule) {
  if (activeJob) {
    activeJob.stop();
    activeJob = null;
  }

  if (!config.enabled) {
    console.log("[scheduler] Agendamento desativado.");
    return;
  }

  const expr = buildCronExpression(config);
  console.log(`[scheduler] Agendando varredura: "${expr}" (mode: ${config.mode})`);

  activeJob = cron.schedule(expr, () => runScraper(config.mode), {
    timezone: "America/Sao_Paulo",
  });
}

export function cancelSchedule() {
  if (activeJob) {
    activeJob.stop();
    activeJob = null;
    console.log("[scheduler] Job cancelado.");
  }
}

export async function initScheduler() {
  try {
    const rows = await db.select().from(scanSchedule).where(eq(scanSchedule.id, 1));
    if (rows.length > 0 && rows[0].enabled) {
      applySchedule(rows[0]);
    } else {
      console.log("[scheduler] Nenhum agendamento ativo encontrado.");
    }
  } catch (err) {
    console.error("[scheduler] Erro ao inicializar scheduler:", err);
  }
}
