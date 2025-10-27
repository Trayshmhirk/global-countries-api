const mysql = require("mysql2/promise");

let pool;

async function init() {
  const config = {
    host: process.env.DATABASE_HOST || "127.0.0.1",
    port: process.env.DATABASE_PORT ? Number(process.env.DATABASE_PORT) : 3306,
    user: process.env.DATABASE_USER || "root",
    password: process.env.DATABASE_PASSWORD || "",
    database: process.env.DATABASE_NAME || "country_cache",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  };

  pool = mysql.createPool(config);

  // Create database if not exists (need a non-db-level connection)
  // If DATABASE_NAME database doesn't exist, attempt to create it.
  try {
    const tmpConn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
    });
    await tmpConn.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\``);
    await tmpConn.end();
  } catch (e) {
    console.error("Could not ensure database exists", e);
    throw e;
  }

  // Ensure tables exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS countries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      capital VARCHAR(255),
      region VARCHAR(255),
      population BIGINT NOT NULL,
      currency_code VARCHAR(10),
      exchange_rate DOUBLE,
      estimated_gdp DOUBLE,
      flag_url TEXT,
      last_refreshed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS metadata (
      ` +
      "`key`" +
      ` VARCHAR(100) PRIMARY KEY,
      value TEXT
    );
  `
  );

  // Ensure last_refreshed_at key exists (optional)
  const [rows] = await pool.query(
    "SELECT value FROM metadata WHERE `key` = ?",
    ["last_refreshed_at"]
  );
  if (rows.length === 0) {
    await pool.query("INSERT INTO metadata (`key`, `value`) VALUES (?, ?)", [
      "last_refreshed_at",
      "",
    ]);
  }
}

function getPool() {
  if (!pool) throw new Error("DB pool not initialized");
  return pool;
}

module.exports = { init, getPool };
