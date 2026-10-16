// Import first: some modules (lib/limits.ts) read their env vars when imported.
try {
  process.loadEnvFile(".env.local");
} catch {}
