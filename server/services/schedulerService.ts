import cron from "node-cron";
import { spawn } from "child_process";
import path from "path";
import { db } from "../db";
import { scanSchedule, type ScanSchedule } from "@shared/schema";
import { eq } from "drizzle-orm";
import { PYTHON } from "./excelService";

let activeJob: cron.ScheduledTask | null = null;

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

function runScraper(mode: string) {
  const args = ["econet_scraper.py", ...(mode === "todos" ? ["--todos"] : [])];
  const child = spawn(PYTHON, args, {
    cwd: path.resolve("."),
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  console.log(`[scheduler] Varredura automática disparada (pid: ${child.pid}, mode: ${mode})`);
}

export function applySchedule(config: ScanSchedule) {
  // cancel existing job
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
