const mysql = require('mysql2/promise');

async function run() {
  const conn = await mysql.createConnection({
    host: 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
    port: 4000,
    user: 'Vt5nXt9Za5gzbaa.root',
    password: 'u9gO8y3tnqHdF1LM',
    database: 'nagpur_connect',
    ssl: { rejectUnauthorized: false }
  });

  const [rows] = await conn.query('SELECT * FROM incident_departments WHERE incident_id = (SELECT id FROM incidents WHERE public_reference="NAG-2026-450003")');
  console.log("Departments:", rows);

  const [rows2] = await conn.query('SELECT * FROM incident_ai_conversations WHERE incident_id = (SELECT id FROM incidents WHERE public_reference="NAG-2026-450003")');
  console.log("Conversations:", rows2);

  const [rows3] = await conn.query('SELECT id, final_ai_report FROM incidents WHERE public_reference="NAG-2026-450003"');
  console.log("Final Report:", rows3[0].final_ai_report);

  conn.end();
}

run().catch(console.error);
