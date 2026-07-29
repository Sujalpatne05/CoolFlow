import 'dotenv/config';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not set in environment variables');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  // Disable channel binding for compatibility
  application_name: 'ordernest-backend',
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export default pool;
