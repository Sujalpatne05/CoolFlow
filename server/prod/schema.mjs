import pool from './db.mjs';
import bcrypt from 'bcryptjs';

export async function setupSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS restaurants (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        owner TEXT NOT NULL,
        city TEXT DEFAULT '',
        status TEXT DEFAULT 'Active',
        plan TEXT DEFAULT 'Standard',
        logo_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'staff',
        restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE SET NULL,
        restaurant_name TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        must_change_password BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS menu_items (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        price NUMERIC(10,2) NOT NULL,
        image_url TEXT DEFAULT '',
        description TEXT DEFAULT '',
        available BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tables (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        table_number INTEGER NOT NULL,
        capacity INTEGER DEFAULT 4,
        section TEXT DEFAULT 'Main Hall',
        status TEXT DEFAULT 'available',
        current_order TEXT,
        reserved_by TEXT,
        estimated_time TEXT
      );

      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        user_id INTEGER,
        order_number TEXT,
        table_number INTEGER,
        items JSONB DEFAULT '[]',
        total NUMERIC(10,2) DEFAULT 0,
        status TEXT DEFAULT 'pending',
        order_type TEXT DEFAULT 'dine-in',
        payment_status TEXT DEFAULT 'unpaid',
        payment_method TEXT,
        notes TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS reservations (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        reservation_date TEXT NOT NULL,
        reservation_time TEXT NOT NULL,
        guests INTEGER DEFAULT 1,
        table_number TEXT DEFAULT 'T1',
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS reservation_tokens (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS deliveries (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        order_number TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        phone TEXT DEFAULT '',
        address TEXT NOT NULL,
        partner TEXT DEFAULT 'in-house',
        amount NUMERIC(10,2) DEFAULT 0,
        driver TEXT DEFAULT 'Unassigned',
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS inventory (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        unit TEXT DEFAULT 'kg',
        quantity NUMERIC(10,2) DEFAULT 0,
        min_stock NUMERIC(10,2) DEFAULT 0,
        max_stock NUMERIC(10,2) DEFAULT 0,
        category TEXT DEFAULT 'General',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS payroll_staff (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        present BOOLEAN DEFAULT TRUE,
        leaves INTEGER DEFAULT 0,
        salary NUMERIC(10,2) DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        assigned_to TEXT DEFAULT 'Unassigned',
        status TEXT DEFAULT 'Pending'
      );

      CREATE TABLE IF NOT EXISTS crm_customers (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        visits INTEGER DEFAULT 1,
        total_spent NUMERIC(10,2) DEFAULT 0,
        vip BOOLEAN DEFAULT FALSE,
        last_visit TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
        restaurant_name TEXT,
        owner TEXT,
        plan TEXT DEFAULT 'Standard',
        status TEXT DEFAULT 'Active',
        start_date TEXT,
        expiry_date TEXT,
        mrr TEXT DEFAULT '₹2,500',
        overdue_days INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS support_tickets (
        id SERIAL PRIMARY KEY,
        subject TEXT NOT NULL,
        restaurant TEXT DEFAULT '',
        status TEXT DEFAULT 'open',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        setting_key TEXT NOT NULL,
        description TEXT,
        enabled BOOLEAN DEFAULT TRUE
      );
    `);

    // Add temp_password column if not exists
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS temp_password TEXT;
    `);
    // Add notes column to orders if not exists
    await client.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
    `);
    // Add settings columns to restaurants if not exists
    await client.query(`
      ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 5.00;
      ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS service_charge NUMERIC(5,2) DEFAULT 0.00;
      ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS default_delivery_partner TEXT DEFAULT 'in-house';
      ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS table_sections JSONB DEFAULT '[]';
      ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS kitchen_printer_ip TEXT;
      ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS kitchen_printer_port INTEGER DEFAULT 9100;
      ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS counter_printer_ip TEXT;
      ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS counter_printer_port INTEGER DEFAULT 9100;
    `);
    const existing = await client.query(`SELECT id FROM users WHERE email = 'superadmin@restrohub.com'`);
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash('Admin@123', 10);
      await client.query(`
        INSERT INTO users (name, email, password_hash, role, restaurant_id, restaurant_name, is_active)
        VALUES ('Super Admin', 'superadmin@restrohub.com', $1, 'superadmin', NULL, NULL, TRUE)
      `, [hash]);
      console.log('[SCHEMA] ✅ Superadmin created: superadmin@restrohub.com / Admin@123');
    }

    // Seed system settings if empty
    const settings = await client.query(`SELECT id FROM system_settings LIMIT 1`);
    if (settings.rows.length === 0) {
      await client.query(`
        INSERT INTO system_settings (setting_key, description, enabled) VALUES
        ('Notifications', 'Configure email and push notifications', TRUE),
        ('Two-Factor Authentication', 'Extra layer of account security', FALSE),
        ('Auto Backups', 'Daily backups for restaurant data', TRUE)
      `);
    }

    console.log('[SCHEMA] ✅ Database schema ready');
  } finally {
    client.release();
  }
}
