import { testConnection, query } from "./src/lib/db";
import { env } from "./src/lib/env";

async function main() {
  console.log("Testing DB connection...");
  console.log("Parsed Env Config:");
  console.log("  Host:", env.databaseHost);
  console.log("  User:", env.databaseUser);
  console.log("  Database:", env.databaseName);
  console.log("  SSL CA Path:", env.databaseSslCaPath);
  
  const result = await testConnection();
  console.log("Connection Test Result:", result);

  if (result.connected) {
    console.log("Successfully connected to TiDB!");
    
    try {
      console.log("Fetching tables...");
      const tables = await query("SHOW TABLES");
      console.log("Tables in database:", tables);
    } catch (e) {
      console.error("Error fetching tables:", e);
    }
  } else {
    console.error("Failed to connect to TiDB.");
  }
  
  process.exit(0);
}

main().catch(console.error);
