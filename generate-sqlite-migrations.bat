@echo off
REM Generate SQLite migrations for development

setlocal enabledelayedexpansion

REM Delete old migrations
if exist migrations (
  rmdir /s /q migrations
  echo ✅ Old migrations deleted
)

REM Set environment and generate
set NODE_ENV=development
echo 📦 Generating SQLite migrations...
call npx drizzle-kit generate

echo.
echo ✅ Done! Now tables will be ready for SQLite.
pause
