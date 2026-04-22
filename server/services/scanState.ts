/**
 * Shared singleton that tracks the PID of the currently running scraper process.
 * Updated by both the manual trigger (routes.ts) and the scheduler (schedulerService.ts).
 */
let _activePid: number | null = null;

export function setActivePid(pid: number | null) {
  _activePid = pid;
}

export function getActivePid(): number | null {
  return _activePid;
}
