# Environment Setup — Desenvolvimento Local e Produção

> Referência completa de como o ambiente está configurado e como funciona a detecção automática dev/prod.

---

## Detecção Automática de Ambiente

O projeto detecta o ambiente via `NODE_ENV` e adapta-se automaticamente. Os arquivos que fazem essa detecção são:

| Arquivo | O que detecta |
|---------|--------------|
| `server/db.ts` | SQLite (dev) vs PostgreSQL/Neon (prod) |
| `drizzle.config.ts` | Config de migrations: SQLite em dev, PostgreSQL em prod |
| `server/index.ts` | Host: `127.0.0.1` (dev) vs `0.0.0.0` (prod) + reusePort |
| `server/replitAuth.ts` | Mock auth (dev) vs Replit OIDC real (prod) |
| `server/routes.ts` | Mock auth middleware (dev) vs `setupAuth()` real (prod) |

---

## Ambiente de Desenvolvimento Local

### Dependências extras instaladas para dev local

- **`cross-env`** — suporte a variáveis de ambiente no Windows
- **`better-sqlite3`** — driver SQLite nativo (banco local sem servidor)

### Banco de dados em dev

- Banco: **SQLite**, arquivo `dev.db` na raiz do projeto
- `dev.db` está no `.gitignore` (junto com `*.db-wal`, `*.db-shm`, `.data/`)
- Schema adaptado para ser agnóstico: usa `VARCHAR` em vez de enums específicos do PostgreSQL, sessions armazenadas em `TEXT`

### Arquivo de configuração local

**`.env.local`** — variáveis de ambiente para desenvolvimento:
```
SESSION_SECRET=...   # Segredo para sessões Express
NODE_ENV=development
# DATABASE_URL não é necessário em dev (usa SQLite automático)
```

### Scripts disponíveis

```bash
npm run setup-dev   # Cria o banco SQLite (rodar apenas na primeira vez)
npm run dev         # Inicia servidor Express + Vite frontend
npm run db:generate # Gera migrations Drizzle
```

### Autenticação em dev

- Mock auth ativo automaticamente quando `NODE_ENV=development`
- Usuário injetado em todos os requests: `{ claims: { sub: 'dev-user-123', email: 'dev@local.test' } }`
- Nenhuma configuração de OIDC necessária

### Endereço local

```
http://127.0.0.1:5000
```

---

## Ambiente de Produção

### Nenhuma mudança de código necessária

O código é 100% agnóstico. Em produção, basta definir as variáveis de ambiente corretas.

### Variáveis de ambiente necessárias em produção

```bash
# Banco de dados (Neon PostgreSQL)
DATABASE_URL=postgresql://...neon.tech/...

# Segurança
SESSION_SECRET=uma-senha-forte-aqui

# Autenticação Replit OIDC (se usar Replit como plataforma)
REPLIT_DOMAINS=seu-domain.replit.dev
ISSUER_URL=https://replit.com/oidc
CLIENT_ID=seu-client-id
CLIENT_SECRET=seu-client-secret
REPL_ID=seu-repl-id
```

### Comportamento em produção

| Aspecto | Produção |
|---------|---------|
| Banco | PostgreSQL via `DATABASE_URL` (Neon) |
| Auth | Replit OIDC real via Passport.js |
| Host | `0.0.0.0` |
| reusePort | `true` |
| SQLite | Não é usado |

### Deploy

```bash
npm run build   # Compila frontend (Vite) + backend (ESBuild)
npm run start   # Sobe o servidor compilado em dist/
```

---

## Comparativo Rápido

| Aspecto | Development | Produção |
|---------|------------|---------|
| `NODE_ENV` | `development` | `production` |
| Banco | SQLite (`dev.db`) | PostgreSQL (Neon via `DATABASE_URL`) |
| Auth | Mock (usuário fixo) | Replit OIDC real |
| Host | `127.0.0.1` | `0.0.0.0` |
| reusePort | `false` | `true` |
| Setup inicial | `npm run setup-dev` | Definir variáveis de ambiente |
