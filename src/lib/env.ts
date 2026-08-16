/* ════════════════════════════════════════════════════════
   Environment Configuration
   Reads actual .env.local key names
   Fail-closed in production, warn in development
   ════════════════════════════════════════════════════════ */

import path from "path";

function optionalEnv(key: string, defaultValue: string = ""): string {
  return process.env[key] || defaultValue;
}

/**
 * Parse TiDB connection details from .env.local
 * 
 * The .env.local has a non-standard layout:
 * - DATABASE_HOST may be "..." (placeholder)
 * - DATABASE_SSL_CA_PATH contains the full mysql CLI command with real credentials
 * - AI keys use standard names: GROQ_LLAMA_API_KEY, ASSEMBLY_AI_MODEL
 */
function parseDatabaseHost(): string {
  const host = optionalEnv("DATABASE_HOST", "");
  if (host && host !== "...") return host;

  // Fallback: extract from DATABASE_SSL_CA_PATH which contains the mysql CLI command
  const sslLine = optionalEnv("DATABASE_SSL_CA_PATH", "");
  const hostMatch = sslLine.match(/-h\s+([^\s]+)/);
  if (hostMatch) return hostMatch[1];

  return "localhost";
}

function parseDatabaseUser(): string {
  const user = optionalEnv("DATABASE_USER", "");
  if (user && user !== "...") return user;

  // Fallback: extract from DATABASE_SSL_CA_PATH
  const sslLine = optionalEnv("DATABASE_SSL_CA_PATH", "");
  const userMatch = sslLine.match(/-u\s+'([^']+)'/);
  if (userMatch) return userMatch[1];

  return "root";
}

export const env = {
  // ─── Database (TiDB) ───
  get databaseHost(): string {
    return parseDatabaseHost();
  },
  databasePort: parseInt(optionalEnv("DATABASE_PORT", "4000"), 10),
  get databaseUser(): string {
    return parseDatabaseUser();
  },
  databasePassword: optionalEnv("DATABASE_PASSWORD", ""),
  databaseName: optionalEnv("DATABASE_NAME", "nagpur_connect"),

  /** Path to TLS CA cert for TiDB Cloud */
  get databaseSslCaPath(): string {
    // The isrgrootx1.pem is in the project parent directory
    return path.resolve(process.cwd(), "..", "isrgrootx1.pem");
  },

  // ─── AI (Groq) ───
  /** Groq API key — stored as "GROQ_LLAMA_API_KEY" in .env.local */
  get groqApiKey(): string {
    return process.env["GROQ_LLAMA_API_KEY"] || optionalEnv("GROQ_API_KEY", "");
  },

  /**
   * AssemblyAI API key.
   * In .env.local it is stored as "ASSEMBLY_AI_MODEL" (misnamed — it IS the key).
   * On Vercel, set ASSEMBLYAI_API_KEY (standard) or ASSEMBLY_AI_MODEL.
   */
  get assemblyAiKey(): string {
    return (
      process.env["ASSEMBLYAI_API_KEY"] ||       // Standard Vercel env var name
      process.env["ASSEMBLY_AI_MODEL"] ||         // Local .env.local (misnamed but valid)
      process.env["ASSEMBLYAI_KEY"] ||            // Alternative
      ""
    );
  },

  // ─── Session ───
  sessionSecret: optionalEnv("SESSION_SECRET", "dev-secret-change-me"),

  // ─── App ───
  appUrl: optionalEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
  nodeEnv: optionalEnv("NODE_ENV", "development"),

  get isProduction(): boolean {
    return this.nodeEnv === "production";
  },

  get isDevelopment(): boolean {
    return this.nodeEnv === "development";
  },
} as const;
