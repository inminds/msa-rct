import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

const HELPER = path.resolve("excel_helper.py");

function findPython(): string {
  if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
    return process.env.PYTHON_PATH;
  }
  if (process.platform === "win32") {
    const candidates = [
      path.join(os.homedir(), "AppData", "Local", "Programs", "Python", "Python313", "python.exe"),
      path.join(os.homedir(), "AppData", "Local", "Programs", "Python", "Python312", "python.exe"),
      path.join(os.homedir(), "AppData", "Local", "Programs", "Python", "Python311", "python.exe"),
      "C:\\Python313\\python.exe",
      "C:\\Python312\\python.exe",
      "C:\\Python311\\python.exe",
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  }
  return process.platform === "win32" ? "python" : "python3";
}

const PYTHON = findPython();
console.log(`[excelService] Using Python: ${PYTHON}`);

function runHelper(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(PYTHON, [HELPER, ...args], { cwd: path.resolve(".") }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

export interface NCMExcelRow {
  NCM: string;
  "NCM Econet": string;
  "Descrição": string;
  "PIS Cumulativo": string;
  "COFINS Cumulativo": string;
  "PIS Não Cumulativo": string;
  "COFINS Não Cumulativo": string;
  "Regime": string;
  "Legislação": string;
  [key: string]: string;
}

export async function readNCMsFromExcel(): Promise<NCMExcelRow[]> {
  const out = await runHelper(["read"]);
  return JSON.parse(out) as NCMExcelRow[];
}

export async function addNCMsToExcel(ncmCodes: string[]): Promise<{ added: string[]; saved_to: string }> {
  if (ncmCodes.length === 0) return { added: [], saved_to: "bcoDados.xlsx" };
  const out = await runHelper(["add", ...ncmCodes]);
  return JSON.parse(out);
}
