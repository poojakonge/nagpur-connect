import mysql from "mysql2/promise";
import fs from "fs";
import { env } from "./src/lib/env";
import { runMigrations } from "./src/lib/db-migrate";

async function main() {
  console.log("Connecting to TiDB to create database...");
  
  let ssl: mysql.SslOptions | undefined;
  try {
    const caPath = env.databaseSslCaPath;
    if (fs.existsSync(caPath)) {
      ssl = {
        ca: fs.readFileSync(caPath, "utf-8"),
        minVersion: "TLSv1.2",
        rejectUnauthorized: true,
      };
    }
  } catch (err) {
    console.warn("[DB] Could not load TLS CA cert, connecting without TLS:", err);
  }

  // Connect without a specific database
  const connection = await mysql.createConnection({
    host: env.databaseHost,
    port: env.databasePort,
    user: env.databaseUser,
    password: env.databasePassword,
    ssl,
  });

  console.log(`Connected to ${env.databaseHost} as ${env.databaseUser}`);
  
  // Create database
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${env.databaseName}\``);
  console.log(`Database '${env.databaseName}' created or already exists.`);
  
  await connection.end();
  
  console.log("Running migrations...");
  const result = await runMigrations();
  if (result.success) {
    console.log("Migrations successful. Tables:", result.tables);
  } else {
    console.error("Migrations failed:", result.error);
  }
  
  process.exit(0);
}

main().catch(console.error);
