import { Request, Response, NextFunction } from "express";

export function demoAuth(req: Request, res: Response, next: NextFunction) {
  // Always allow access for demonstration purposes
  return next();
}
