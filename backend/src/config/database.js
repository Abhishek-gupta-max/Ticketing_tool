import mysql from 'mysql2/promise';
import { env } from './env.js';
import { logger } from './logger.js';

let pool = null;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.dbName,
      connectionLimit: env.DB_CONNECTION_LIMIT,
      waitForConnections: true,
      queueLimit: 0,
      enableKeepAlive: true,
      // Every DATETIME column is stored and read as UTC.
      timezone: 'Z',
      dateStrings: false,
      decimalNumbers: true,
      supportBigNumbers: true,
      bigNumberStrings: false,
      charset: 'utf8mb4_unicode_ci',
      namedPlaceholders: false,
      // Hosted MySQL services require TLS; the server certificate is verified.
      ssl: env.DB_SSL ? { rejectUnauthorized: true } : undefined,
    });
    pool.on('connection', (conn) => {
      conn.query("SET SESSION time_zone = '+00:00'");
    });
  }
  return pool;
}

/** Run a query on the pool (or on a transaction connection when given). */
export async function query(sql, params = [], conn = null) {
  const [rows] = await (conn || getPool()).query(sql, params);
  return rows;
}

export async function queryOne(sql, params = [], conn = null) {
  const rows = await query(sql, params, conn);
  return rows[0] || null;
}

/**
 * Run fn inside a transaction. fn receives the connection; everything it does
 * is committed together or rolled back together.
 */
export async function withTransaction(fn) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch (rollbackErr) { logger.error('Rollback failed', { error: rollbackErr.message }); }
    throw err;
  } finally {
    conn.release();
  }
}

export async function pingDatabase() {
  const row = await queryOne('SELECT DATABASE() AS db, VERSION() AS version');
  return row;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
