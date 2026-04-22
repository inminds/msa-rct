/**
 * replitAuth.ts — mantido apenas para compatibilidade de imports.
 * Todo o código Replit/OIDC foi removido.
 * A autenticação é feita via localAuth.ts (passport-local + session).
 */
export { isAuthenticatedLocal as isAuthenticated } from "./localAuth";
