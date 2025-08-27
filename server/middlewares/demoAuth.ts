import { Request, Response, NextFunction } from "express";

export function demoAuth(req: Request, res: Response, next: NextFunction) {
  const mode = (process.env.AUTH_MODE || "none").toLowerCase();

  // Modo "none": tudo liberado
  if (mode === "none") return next();

  // Modo "demo": exige header com chave simples
  if (mode === "demo") {
    const expected = process.env.DEMO_KEY;
    const provided = (req.headers["x-demo-key"] as string) || "";

    if (!expected) {
      console.warn("[demoAuth] DEMO_KEY não configurado; liberando acesso.");
      return next();
    }
    if (provided === expected) return next();

    return res.status(401).json({
      error: "Unauthorized",
      hint: "envie o header x-demo-key com a chave correta",
    });
  }

  // Outros modos futuros (ex.: oauth, jwt) podem cair aqui
  return res.status(501).json({ error: "Auth mode not implemented", mode });
}
