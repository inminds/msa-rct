const API_URL = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");
const DEMO_KEY = import.meta.env.VITE_DEMO_KEY || ""; // "InMinds@2025"

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`; // aceita "/api/..." ou "api/..."
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-demo-key": DEMO_KEY,
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) throw new Error(`Erro ${res.status}: ${await res.text()}`);
  // Se a rota não retorna JSON, troque por res.text() quando necessário
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("application/json") ? res.json() : res.text()) as any;
}
