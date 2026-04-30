import { rawGet, rawAll, rawRun } from "./rawDb.js";

export const PERMISSIONS = {
  APROVAR_ETAPA1:   "aprovar_etapa1",
  APROVAR_ETAPA2:   "aprovar_etapa2",
  ACEITAR_MUDANCAS: "aceitar_mudancas",
  EXPORTAR:         "exportar",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export const PERMISSION_LABELS: Record<Permission, { label: string; description: string }> = {
  aprovar_etapa1:   { label: "Aprovar varredura — Etapa 1", description: "Primeira aprovação do fluxo de solicitação de varredura" },
  aprovar_etapa2:   { label: "Aprovar varredura — Etapa 2", description: "Segunda aprovação — dispara a varredura efetivamente" },
  aceitar_mudancas: { label: "Aceitar/rejeitar mudanças de NCM", description: "Validar mudanças detectadas pelo RPA nas alíquotas" },
  exportar:         { label: "Exportar relatórios", description: "Gerar e baixar relatórios tributários" },
};

export async function hasPermission(userId: string, permission: Permission): Promise<boolean> {
  const row = await rawGet(
    "SELECT 1 as found FROM user_permissions WHERE user_id = ? AND permission = ?",
    [userId, permission]
  );
  return !!(row as any)?.found;
}

export async function getUserPermissions(userId: string): Promise<Permission[]> {
  const rows = await rawAll(
    "SELECT permission FROM user_permissions WHERE user_id = ?",
    [userId]
  ) as { permission: string }[];
  return rows.map((r) => r.permission as Permission);
}

export async function setUserPermissions(
  userId: string,
  permissions: Permission[],
  grantedBy: string
): Promise<void> {
  await rawRun("DELETE FROM user_permissions WHERE user_id = ?", [userId]);
  for (const permission of permissions) {
    await rawRun(
      "INSERT INTO user_permissions (user_id, permission, granted_by) VALUES (?, ?, ?)",
      [userId, permission, grantedBy]
    );
  }
}
