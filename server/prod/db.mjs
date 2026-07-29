import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from server directory
dotenv.config({ path: join(__dirname, '../.env') });

const { Pool } = pg;

// Create pool configuration
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: 10,
};

// Add SSL configuration for production databases
if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode=require')) {
  poolConfig.ssl = {
    rejectUnauthorized: false
  };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client', err.message);
});

export const query = (text, params) => pool.query(text, params);
export default pool;
