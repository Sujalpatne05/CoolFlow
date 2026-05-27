import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Pool } from "pg";

dotenv.config();

const PORT = Number(process.env.PORT || 5000);
const JWT_SECRET = process.env.JWT_SECRET || "restaurant-secret-key";
const DATABASE_URL = process.env.DATABASE_URL;
const SUPERADMIN_EMAIL = normalizeEnvEmail(process.env.SUPERADMIN_EMAIL) || "superadmin@logdine.local";
const SUPERADMIN_PASSWORD = String(process.env.SUPERADMIN_PASSWORD || "super123");

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is missing in environment.");
}

const pool = new Pool({ connectionString: DATABASE_URL });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const send = (res, status, payload) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(payload));
};

const parseBody = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error("Payload too large"));
    });
    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });

const notFound = (res) => send(res, 404, { error: "Not found" });

const unauthorized = (res, message = "Unauthorized") => send(res, 401, { error: message });

const getTokenPayload = (req) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
};

const requireRoles = (res, payload, allowedRoles) => {
  if (!payload) {
    unauthorized(res, "Missing or invalid token");
    return false;
  }
  if (!allowedRoles.includes(payload.role)) {
    send(res, 403, { error: "Forbidden" });
    return false;
  }
  return true;
};

const requireTenantScope = async (req, res, allowedRoles = ["admin", "superadmin"]) => {
  const payload = getTokenPayload(req);
  if (!requireRoles(res, payload, allowedRoles)) return null;
  const scope = await getActorRestaurantScope(payload);
  return { payload, scope };
};

const withTenantFilter = (scope, superAdminQuery, tenantQuery, tenantParams = []) => {
  if (scope.isSuperAdmin) {
    return pool.query(superAdminQuery);
  }
  return pool.query(tenantQuery, [...tenantParams, scope.restaurantId]);
};

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function normalizeEnvEmail(value) {
  if (!value) return "";
  return String(value).trim().toLowerCase();
}

const extractTableNumber = (value) => {
  const raw = String(value || "").trim();
  const match = raw.match(/\d+/);
  return match ? Number(match[0]) : null;
};

const ensureRestaurantRecord = async (restaurantName, owner = "Unassigned Owner", city = "") => {
  const normalizedName = String(restaurantName || "").trim();
  if (!normalizedName) return null;

  const existing = await pool.query(
    "SELECT id, name FROM restaurants WHERE LOWER(name) = LOWER($1) ORDER BY id ASC LIMIT 1",
    [normalizedName],
  );
  if (existing.rowCount > 0) {
    return existing.rows[0];
  }

  const created = await pool.query(
    `INSERT INTO restaurants (name, owner, city, status, plan)
     VALUES ($1, $2, $3, 'Active', 'Standard')
     RETURNING id, name`,
    [normalizedName, String(owner || "Unassigned Owner").trim(), String(city || "").trim()],
  );
  return created.rows[0];
};

const getActorRestaurantScope = async (payload) => {
  if (payload.role === "superadmin") {
    return { isSuperAdmin: true, restaurantId: null, restaurantName: null };
  }

  const userResult = await pool.query(
    `SELECT u.id, u.restaurant_id, u.restaurant_name,
            r_by_id.name AS restaurant_name_by_id,
            r_by_name.id AS restaurant_id_by_name,
            r_by_name.name AS restaurant_name_by_name
     FROM users u
     LEFT JOIN restaurants r_by_id ON r_by_id.id = u.restaurant_id
     LEFT JOIN restaurants r_by_name ON LOWER(r_by_name.name) = LOWER(COALESCE(u.restaurant_name, ''))
     WHERE u.id = $1
     LIMIT 1`,
    [payload.id],
  );

  if (userResult.rowCount === 0) {
    throw new Error("User not found for tenant scope");
  }

  const row = userResult.rows[0];
  let restaurantId = row.restaurant_id || row.restaurant_id_by_name || null;
  let restaurantName = row.restaurant_name_by_id || row.restaurant_name_by_name || row.restaurant_name || null;

  if (!restaurantId && row.restaurant_name) {
    const ensuredRestaurant = await ensureRestaurantRecord(row.restaurant_name, row.name || "Unassigned Owner", "");
    if (ensuredRestaurant) {
      restaurantId = ensuredRestaurant.id;
      restaurantName = ensuredRestaurant.name;
    }
  }

  if (!restaurantId) {
    throw new Error("Admin restaurant mapping is missing. Please map admin to a restaurant.");
  }

  if (!row.restaurant_id || String(row.restaurant_name || "").trim() !== String(restaurantName || "").trim()) {
    await pool.query(
      `UPDATE users
       SET restaurant_id = $1,
           restaurant_name = COALESCE($2, restaurant_name),
           updated_at = NOW()
       WHERE id = $3`,
      [restaurantId, restaurantName, payload.id],
    );
  }

  return {
    isSuperAdmin: false,
    restaurantId,
    restaurantName,
  };
};

const initializeDatabase = async () => {
  const sqlPath = path.join(__dirname, "src", "db_init.sql");
  const schemaSql = await readFile(sqlPath, "utf8");
  await pool.query(schemaSql);

  // Backward-compatible migration for existing databases.
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending'");
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW()");
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()");
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_number INTEGER");
  await pool.query("ALTER TABLE restaurant_tables ADD COLUMN IF NOT EXISTS occupied_since TIMESTAMP");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS restaurant_name VARCHAR(120)");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS temp_password_expires_at TIMESTAMP");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW()");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id)");
  await pool.query("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS city VARCHAR(120)");
  await pool.query("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW()");
  await pool.query("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()");
  await pool.query("ALTER TABLE menu ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id)");
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id)");
  await pool.query("ALTER TABLE restaurant_tables ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id)");
  await pool.query("ALTER TABLE reservations ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id)");
  await pool.query("ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id)");
  await pool.query("ALTER TABLE pos_transactions ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id)");
  await pool.query("ALTER TABLE inventory ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id)");
  await pool.query("ALTER TABLE inventory ADD COLUMN IF NOT EXISTS min_stock INTEGER NOT NULL DEFAULT 0");
  await pool.query("ALTER TABLE inventory ADD COLUMN IF NOT EXISTS max_stock INTEGER NOT NULL DEFAULT 0");
  await pool.query("ALTER TABLE inventory ADD COLUMN IF NOT EXISTS category VARCHAR(80) NOT NULL DEFAULT 'General'");
  await pool.query("ALTER TABLE inventory ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()");
  await pool.query("ALTER TABLE payroll_staff ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id)");
  await pool.query("ALTER TABLE payroll_staff ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW()");
  await pool.query("ALTER TABLE payroll_staff ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()");
  await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id)");
  await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW()");
  await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()");
  await pool.query("ALTER TABLE recipes ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id)");
  await pool.query("ALTER TABLE recipes ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW()");
  await pool.query("ALTER TABLE recipes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()");
  await pool.query("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id)");
  await pool.query("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id)");
  await pool.query("ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id)");
  await pool.query(
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conname = 'inventory_restaurant_id_fkey'
       ) THEN
         ALTER TABLE inventory
         ADD CONSTRAINT inventory_restaurant_id_fkey
         FOREIGN KEY (restaurant_id) REFERENCES restaurants(id);
       END IF;
     END $$;`,
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS crm_customers (
      id SERIAL PRIMARY KEY,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
      name VARCHAR(120) NOT NULL,
      email VARCHAR(140) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      visits INTEGER NOT NULL DEFAULT 0,
      total_spent NUMERIC(12,2) NOT NULL DEFAULT 0,
      vip BOOLEAN NOT NULL DEFAULT FALSE,
      last_visit TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
  );
  await pool.query("ALTER TABLE restaurant_tables DROP CONSTRAINT IF EXISTS restaurant_tables_table_number_key");
  await pool.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS restaurant_tables_restaurant_id_table_number_uidx ON restaurant_tables (restaurant_id, table_number)",
  );
  await pool.query("UPDATE orders SET status = 'pending' WHERE status IS NULL");
  await pool.query("UPDATE restaurant_tables SET occupied_since = NOW() WHERE status = 'occupied' AND occupied_since IS NULL");

  const demoRestaurant = await ensureRestaurantRecord("Demo Restaurant", "Platform Team", "");
  const demoRestaurantId = demoRestaurant?.id || null;

  await pool.query(
    `UPDATE users u
     SET restaurant_id = r.id
     FROM restaurants r
     WHERE u.restaurant_id IS NULL
       AND u.role = 'admin'
       AND LOWER(COALESCE(u.restaurant_name, '')) = LOWER(r.name)`,
  );

  if (demoRestaurantId) {
    await pool.query("UPDATE menu SET restaurant_id = $1 WHERE restaurant_id IS NULL", [demoRestaurantId]);
    await pool.query("UPDATE orders SET restaurant_id = $1 WHERE restaurant_id IS NULL", [demoRestaurantId]);
    await pool.query("UPDATE restaurant_tables SET restaurant_id = $1 WHERE restaurant_id IS NULL", [demoRestaurantId]);
    await pool.query("UPDATE reservations SET restaurant_id = $1 WHERE restaurant_id IS NULL", [demoRestaurantId]);
    await pool.query("UPDATE deliveries SET restaurant_id = $1 WHERE restaurant_id IS NULL", [demoRestaurantId]);
    await pool.query("UPDATE pos_transactions SET restaurant_id = $1 WHERE restaurant_id IS NULL", [demoRestaurantId]);
    await pool.query("UPDATE inventory SET restaurant_id = $1 WHERE restaurant_id IS NULL", [demoRestaurantId]);
    await pool.query("UPDATE payroll_staff SET restaurant_id = $1 WHERE restaurant_id IS NULL", [demoRestaurantId]);
    await pool.query("UPDATE tasks SET restaurant_id = $1 WHERE restaurant_id IS NULL", [demoRestaurantId]);
    await pool.query("UPDATE recipes SET restaurant_id = $1 WHERE restaurant_id IS NULL", [demoRestaurantId]);
    await pool.query("UPDATE subscriptions SET restaurant_id = $1 WHERE restaurant_id IS NULL", [demoRestaurantId]);
    await pool.query("UPDATE system_settings SET restaurant_id = $1 WHERE restaurant_id IS NULL", [demoRestaurantId]);
    await pool.query("UPDATE support_tickets SET restaurant_id = $1 WHERE restaurant_id IS NULL", [demoRestaurantId]);
  }

  // Enforce tenant scope at DB level for core tables after backfill.
  await pool.query("ALTER TABLE menu ALTER COLUMN restaurant_id SET NOT NULL");
  await pool.query("ALTER TABLE orders ALTER COLUMN restaurant_id SET NOT NULL");
  await pool.query("ALTER TABLE restaurant_tables ALTER COLUMN restaurant_id SET NOT NULL");
  await pool.query("ALTER TABLE reservations ALTER COLUMN restaurant_id SET NOT NULL");
  await pool.query("ALTER TABLE deliveries ALTER COLUMN restaurant_id SET NOT NULL");
  await pool.query("ALTER TABLE pos_transactions ALTER COLUMN restaurant_id SET NOT NULL");
  await pool.query("ALTER TABLE inventory ALTER COLUMN restaurant_id SET NOT NULL");
  await pool.query("ALTER TABLE payroll_staff ALTER COLUMN restaurant_id SET NOT NULL");
  await pool.query("ALTER TABLE tasks ALTER COLUMN restaurant_id SET NOT NULL");
  await pool.query("ALTER TABLE recipes ALTER COLUMN restaurant_id SET NOT NULL");
  await pool.query("ALTER TABLE subscriptions ALTER COLUMN restaurant_id SET NOT NULL");
  await pool.query("ALTER TABLE system_settings ALTER COLUMN restaurant_id SET NOT NULL");
  await pool.query("ALTER TABLE support_tickets ALTER COLUMN restaurant_id SET NOT NULL");

  await pool.query("CREATE INDEX IF NOT EXISTS idx_orders_restaurant_created ON orders (restaurant_id, created_at)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status ON orders (restaurant_id, status)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_created ON reservations (restaurant_id, created_at)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_status ON reservations (restaurant_id, status)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_deliveries_restaurant_created ON deliveries (restaurant_id, created_at)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_deliveries_restaurant_status ON deliveries (restaurant_id, status)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_tasks_restaurant_created ON tasks (restaurant_id, created_at)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_tasks_restaurant_status ON tasks (restaurant_id, status)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_support_tickets_restaurant_created ON support_tickets (restaurant_id, created_at)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_support_tickets_restaurant_status ON support_tickets (restaurant_id, status)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_recipes_restaurant_created ON recipes (restaurant_id, created_at)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_crm_customers_restaurant_created ON crm_customers (restaurant_id, created_at)");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS system_settings_restaurant_key_uidx ON system_settings (restaurant_id, setting_key)");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_restaurant_name_uidx ON subscriptions (restaurant_id, lower(restaurant_name))");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS crm_customers_restaurant_email_uidx ON crm_customers (restaurant_id, lower(email))");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS recipes_restaurant_name_uidx ON recipes (restaurant_id, lower(name))");

  const ensureUser = async (name, email, password, role, restaurantName = null, mustChangePassword = false) => {
    const hashed = await bcrypt.hash(password, 10);
    const restaurantRecord = role === "admin" && restaurantName
      ? await ensureRestaurantRecord(restaurantName, name, "")
      : null;
    await pool.query(
      `INSERT INTO users (name, email, password, role, restaurant_name, restaurant_id, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (email)
       DO UPDATE SET
         name = EXCLUDED.name,
         role = EXCLUDED.role,
         restaurant_name = COALESCE(users.restaurant_name, EXCLUDED.restaurant_name),
         restaurant_id = COALESCE(users.restaurant_id, EXCLUDED.restaurant_id),
         is_active = COALESCE(users.is_active, true),
         must_change_password = users.must_change_password,
         temp_password_expires_at = users.temp_password_expires_at,
         updated_at = NOW()`,
      [name, normalizeEmail(email), hashed, role, restaurantName, restaurantRecord?.id || null, mustChangePassword]
    );
  };

  await ensureUser("Platform Super Admin", SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, "superadmin", null, false);

  const menuCount = await pool.query("SELECT COUNT(*)::int AS count FROM menu");
  if (menuCount.rows[0].count === 0 && demoRestaurantId) {
    await pool.query(
      `INSERT INTO menu (restaurant_id, name, price, available)
       VALUES
       ($1, 'Butter Chicken', 350, true),
       ($1, 'Paneer Tikka', 280, true),
       ($1, 'Garlic Naan', 60, true),
       ($1, 'Jeera Rice', 180, true),
       ($1, 'Masala Chai', 80, true),
       ($1, 'Gulab Jamun', 120, true)`,
      [demoRestaurantId],
    );
  }

  const tableCount = await pool.query("SELECT COUNT(*)::int AS count FROM restaurant_tables");
  if (tableCount.rows[0].count === 0 && demoRestaurantId) {
    await pool.query(
      `INSERT INTO restaurant_tables
       (restaurant_id, table_number, capacity, section, status, current_order, reserved_by, estimated_time)
       VALUES
       ($1, 1, 2, 'Main Hall', 'available', NULL, NULL, NULL),
       ($1, 2, 4, 'Main Hall', 'occupied', 'ORD-001', NULL, 30),
       ($1, 3, 4, 'Main Hall', 'reserved', NULL, 'John Doe', 60),
       ($1, 4, 6, 'Outdoor', 'available', NULL, NULL, NULL),
       ($1, 5, 8, 'Private Room', 'occupied', 'ORD-002', NULL, 45),
       ($1, 6, 2, 'Main Hall', 'maintenance', NULL, NULL, NULL)`,
      [demoRestaurantId],
    );
  }

  const reservationsCount = await pool.query("SELECT COUNT(*)::int AS count FROM reservations");
  if (reservationsCount.rows[0].count === 0 && demoRestaurantId) {
    const t3 = await pool.query("SELECT id FROM restaurant_tables WHERE table_number = 3 AND restaurant_id = $1 LIMIT 1", [demoRestaurantId]);
    const t8 = await pool.query("SELECT id FROM restaurant_tables WHERE table_number = 8 AND restaurant_id = $1 LIMIT 1", [demoRestaurantId]);
    await pool.query(
      `INSERT INTO reservations
       (restaurant_id, customer_name, customer_phone, reservation_date, reservation_time, guests, table_id, status)
       VALUES
       ($1, 'Aarav Sharma', '9876543210', CURRENT_DATE, '19:00', 4, $2, 'confirmed'),
       ($1, 'Maya Nair', '9988776655', CURRENT_DATE, '20:30', 2, $3, 'pending')`,
      [demoRestaurantId, t3.rows[0]?.id || null, t8.rows[0]?.id || null],
    );
  }

  const deliveriesCount = await pool.query("SELECT COUNT(*)::int AS count FROM deliveries");
  if (deliveriesCount.rows[0].count === 0 && demoRestaurantId) {
    await pool.query(
      `INSERT INTO deliveries
       (restaurant_id, order_number, customer_name, customer_phone, customer_address, status, driver_name, partner, order_total)
       VALUES
       ($1, 'ORD-301', 'Ria Verma', '9123456780', 'Sector 45, Noida', 'assigned', 'Aman', 'in-house', 840),
       ($1, 'ORD-302', 'Kunal Jain', '9012345678', 'Andheri West, Mumbai', 'in_transit', 'Swiggy Rider', 'swiggy', 460)`,
      [demoRestaurantId],
    );
  }

  const ordersCount = await pool.query("SELECT COUNT(*)::int AS count FROM orders");
  if (ordersCount.rows[0].count === 0 && demoRestaurantId) {
    const adminUser = await pool.query("SELECT id FROM users WHERE role='admin' ORDER BY id ASC LIMIT 1");
    const adminId = adminUser.rows[0]?.id || null;
    await pool.query(
      "INSERT INTO orders (restaurant_id, user_id, items, total, status) VALUES ($1, $2, $3, $4, $7), ($1, $2, $5, $6, $8)",
      [demoRestaurantId, adminId, ["Paneer Tikka x1", "Garlic Naan x2"], 400, ["Butter Chicken x1", "Jeera Rice x1"], 530, "pending", "preparing"],
    );

    await pool.query("UPDATE restaurant_tables SET current_order = 'ORD-1', occupied_since = COALESCE(occupied_since, NOW()) WHERE table_number = 2 AND restaurant_id = $1", [demoRestaurantId]);
  }

  const inventoryCount = await pool.query("SELECT COUNT(*)::int AS count FROM inventory");
  if (inventoryCount.rows[0].count === 0 && demoRestaurantId) {
    await pool.query(
      `INSERT INTO inventory (restaurant_id, name, quantity, unit, min_stock, max_stock, category)
       VALUES
       ($1, 'Chicken', 25, 'kg', 10, 50, 'Meat'),
       ($1, 'Paneer', 8, 'kg', 5, 30, 'Dairy'),
       ($1, 'Basmati Rice', 45, 'kg', 20, 100, 'Grains')`,
      [demoRestaurantId],
    );
  }

  const payrollCount = await pool.query("SELECT COUNT(*)::int AS count FROM payroll_staff");
  if (payrollCount.rows[0].count === 0 && demoRestaurantId) {
    await pool.query(
      `INSERT INTO payroll_staff (restaurant_id, name, role, present, leaves, salary)
       VALUES
       ($1, 'Amit Kumar', 'Waiter', TRUE, 2, 15000),
       ($1, 'Priya Singh', 'Chef', FALSE, 1, 22000),
       ($1, 'Rahul Verma', 'Manager', TRUE, 0, 30000)`,
      [demoRestaurantId],
    );
  }

  const tasksCount = await pool.query("SELECT COUNT(*)::int AS count FROM tasks");
  if (tasksCount.rows[0].count === 0 && demoRestaurantId) {
    await pool.query(
      `INSERT INTO tasks (restaurant_id, title, assigned_to, status)
       VALUES
       ($1, 'Check inventory', 'Amit Kumar', 'Pending'),
       ($1, 'Clean kitchen', 'Priya Singh', 'In Progress'),
       ($1, 'Update menu', 'Rahul Verma', 'Completed')`,
      [demoRestaurantId],
    );
  }

  const recipesCount = await pool.query("SELECT COUNT(*)::int AS count FROM recipes");
  if (recipesCount.rows[0].count === 0 && demoRestaurantId) {
    await pool.query(
      `INSERT INTO recipes (restaurant_id, name, category, prep_time, stock, image, ingredients)
       VALUES
       ($1, 'Paneer Tikka', 'Starter', 20, 'Available', 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=80', 'Paneer, Yogurt, Spices, Capsicum'),
       ($1, 'Veg Biryani', 'Main Course', 30, 'Available', 'https://images.unsplash.com/photo-1604908177522-432c5c7c1c8a?auto=format&fit=crop&w=400&q=80', 'Rice, Mixed Vegetables, Spices')`,
      [demoRestaurantId],
    );
  }

  const crmCount = await pool.query("SELECT COUNT(*)::int AS count FROM crm_customers");
  if (crmCount.rows[0].count === 0 && demoRestaurantId) {
    await pool.query(
      `INSERT INTO crm_customers (restaurant_id, name, email, phone, visits, total_spent, vip, last_visit)
       VALUES
       ($1, 'Rahul Sharma', 'rahul@email.com', '+91 98765 43210', 32, 24500, TRUE, NOW()),
       ($1, 'Priya Singh', 'priya@email.com', '+91 87654 32109', 18, 12800, FALSE, NOW() - INTERVAL '1 day')`,
      [demoRestaurantId],
    );
  }

  const settingsCount = await pool.query("SELECT COUNT(*)::int AS count FROM system_settings");
  if (settingsCount.rows[0].count === 0 && demoRestaurantId) {
    await pool.query(
      `INSERT INTO system_settings (restaurant_id, setting_key, description, enabled)
       VALUES
       ($1, 'Notifications', 'Configure email and push notifications', TRUE),
       ($1, 'Two-Factor Authentication', 'Extra layer of account security', FALSE),
       ($1, 'Auto Backups', 'Daily backups for restaurant data', TRUE)`,
      [demoRestaurantId],
    );
  }

  const subscriptionsCount = await pool.query("SELECT COUNT(*)::int AS count FROM subscriptions");
  if (subscriptionsCount.rows[0].count === 0 && demoRestaurantId) {
    await pool.query(
      `INSERT INTO subscriptions (restaurant_id, restaurant_name, owner, plan, status, expiry_date)
       VALUES
       ($1, 'Demo Restaurant', 'Platform Team', 'Standard', 'Active', CURRENT_DATE + INTERVAL '90 days')`,
      [demoRestaurantId],
    );
  }

  const supportCount = await pool.query("SELECT COUNT(*)::int AS count FROM support_tickets");
  if (supportCount.rows[0].count === 0 && demoRestaurantId) {
    await pool.query(
      `INSERT INTO support_tickets (restaurant_id, subject, restaurant, status)
       VALUES
       ($1, 'Payment gateway issue', 'Demo Restaurant', 'open'),
       ($1, 'Menu not syncing', 'Demo Restaurant', 'in-progress')`,
      [demoRestaurantId],
    );
  }
};

const server = createServer(async (req, res) => {
  if (!req.url || !req.method) {
    send(res, 400, { error: "Invalid request" });
    return;
  }

  if (req.method === "OPTIONS") {
    send(res, 200, { ok: true });
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathName = url.pathname;

  try {
    if (req.method === "GET" && pathName === "/health") {
      send(res, 200, { ok: true, service: "postgres-backend" });
      return;
    }

    if (req.method === "POST" && pathName === "/auth/login") {
      const body = await parseBody(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "").trim();
      const expectedRole = body.role ? String(body.role).trim() : null;

      if (!username || !password) {
        send(res, 400, { error: "Username and password are required" });
        return;
      }

      const normalizedInput = normalizeEmail(username);
      const result = await pool.query(
        `SELECT u.*, r.name AS restaurant_name_resolved
         FROM users u
         LEFT JOIN restaurants r ON r.id = u.restaurant_id
         WHERE LOWER(u.email) = $1 OR LOWER(u.name) = $1
         ORDER BY u.id DESC
         LIMIT 1`,
        [normalizedInput],
      );
      if (result.rowCount === 0) {
        unauthorized(res, "Invalid credentials");
        return;
      }

      const user = result.rows[0];
      if (!user.is_active) {
        unauthorized(res, "Account is inactive. Contact super admin.");
        return;
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        unauthorized(res, "Invalid credentials");
        return;
      }

      if (user.temp_password_expires_at && new Date(user.temp_password_expires_at).getTime() < Date.now()) {
        unauthorized(res, "Temporary password expired. Request reset from super admin.");
        return;
      }

      if (expectedRole && user.role !== expectedRole) {
        unauthorized(res, "Role mismatch");
        return;
      }

      let actorScope = { restaurantId: null, restaurantName: null };
      if (user.role === "admin") {
        try {
          actorScope = await getActorRestaurantScope({ id: user.id, role: user.role });
        } catch {
          unauthorized(res, "Admin account is not mapped to a restaurant.");
          return;
        }
      }

      const token = jwt.sign(
        { id: user.id, role: user.role, name: user.name },
        JWT_SECRET,
        { expiresIn: "7d" },
      );

      send(res, 200, {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          restaurantId: actorScope.restaurantId,
          restaurantName: actorScope.restaurantName || user.restaurant_name_resolved || user.restaurant_name,
          mustChangePassword: Boolean(user.must_change_password),
        },
      });
      return;
    }

    if (req.method === "POST" && pathName === "/auth/change-password") {
      const payload = getTokenPayload(req);
      if (!payload) {
        unauthorized(res, "Missing or invalid token");
        return;
      }
      const body = await parseBody(req);
      const currentPassword = String(body.currentPassword || "").trim();
      const newPassword = String(body.newPassword || "").trim();

      if (!currentPassword || !newPassword || newPassword.length < 8) {
        send(res, 400, { error: "Current password and new password (min 8 chars) are required" });
        return;
      }

      const userResult = await pool.query("SELECT id, password FROM users WHERE id = $1 LIMIT 1", [payload.id]);
      if (userResult.rowCount === 0) {
        unauthorized(res, "User not found");
        return;
      }
      const user = userResult.rows[0];
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) {
        unauthorized(res, "Current password is incorrect");
        return;
      }

      const nextHash = await bcrypt.hash(newPassword, 10);
      await pool.query(
        `UPDATE users
         SET password = $1,
             must_change_password = FALSE,
             temp_password_expires_at = NULL,
             updated_at = NOW()
         WHERE id = $2`,
        [nextHash, payload.id],
      );

      send(res, 200, { success: true, message: "Password updated successfully" });
      return;
    }

    if (req.method === "GET" && pathName === "/profile") {
      const payload = getTokenPayload(req);
      if (!payload) {
        unauthorized(res, "Missing or invalid token");
        return;
      }

      const result = await pool.query(
        `SELECT u.id, u.name, u.email, u.role,
                u.restaurant_id,
                COALESCE(r.name, u.restaurant_name, '') AS restaurant_name
         FROM users u
         LEFT JOIN restaurants r ON r.id = u.restaurant_id
         WHERE u.id = $1
         LIMIT 1`,
        [payload.id],
      );
      if (result.rowCount === 0) {
        unauthorized(res, "User not found");
        return;
      }
      const row = result.rows[0];
      send(res, 200, {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        restaurantId: row.restaurant_id || null,
        restaurantName: row.restaurant_name || "",
      });
      return;
    }

    if (req.method === "GET" && pathName === "/superadmin/users") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["superadmin"])) return;

      const result = await pool.query(
        `SELECT id, name, email, role, COALESCE(restaurant_name, '-') AS restaurant_name,
                is_active, must_change_password, created_at
         FROM users
         WHERE role = 'admin'
         ORDER BY id DESC`,
      );
      send(res, 200, result.rows);
      return;
    }

    if (req.method === "GET" && pathName === "/superadmin/restaurants") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["superadmin"])) return;

      const result = await pool.query(
        `SELECT id, name, owner, status, plan, COALESCE(city, '') AS city, created_at
         FROM restaurants
         ORDER BY id DESC`,
      );
      send(res, 200, result.rows);
      return;
    }

    if (req.method === "POST" && pathName === "/superadmin/restaurants") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["superadmin"])) return;

      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      const owner = String(body.owner || "").trim();
      const city = String(body.city || "").trim();
      const plan = String(body.plan || "Standard").trim();
      const status = String(body.status || "Active").trim();

      if (!name || !owner || !city) {
        send(res, 400, { error: "name, owner and city are required" });
        return;
      }
      if (!["Standard", "Premium"].includes(plan)) {
        send(res, 400, { error: "Invalid plan" });
        return;
      }
      if (!["Active", "Inactive"].includes(status)) {
        send(res, 400, { error: "Invalid status" });
        return;
      }

      const result = await pool.query(
        `INSERT INTO restaurants (name, owner, city, plan, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, owner, status, plan, COALESCE(city, '') AS city, created_at`,
        [name, owner, city, plan, status],
      );

      send(res, 201, result.rows[0]);
      return;
    }

    if (req.method === "PUT" && /^\/superadmin\/restaurants\/\d+$/.test(pathName)) {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["superadmin"])) return;

      const id = Number(pathName.split("/")[3]);
      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      const owner = String(body.owner || "").trim();
      const city = String(body.city || "").trim();
      const plan = String(body.plan || "Standard").trim();
      const status = String(body.status || "Active").trim();

      if (!name || !owner || !city) {
        send(res, 400, { error: "name, owner and city are required" });
        return;
      }
      if (!["Standard", "Premium"].includes(plan)) {
        send(res, 400, { error: "Invalid plan" });
        return;
      }
      if (!["Active", "Inactive"].includes(status)) {
        send(res, 400, { error: "Invalid status" });
        return;
      }

      const result = await pool.query(
        `UPDATE restaurants
         SET name = $1,
             owner = $2,
             city = $3,
             plan = $4,
             status = $5,
             updated_at = NOW()
         WHERE id = $6
         RETURNING id, name, owner, status, plan, COALESCE(city, '') AS city, created_at`,
        [name, owner, city, plan, status, id],
      );

      if (result.rowCount === 0) {
        notFound(res);
        return;
      }
      send(res, 200, result.rows[0]);
      return;
    }

    if (req.method === "DELETE" && /^\/superadmin\/restaurants\/\d+$/.test(pathName)) {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["superadmin"])) return;

      const id = Number(pathName.split("/")[3]);
      const result = await pool.query("DELETE FROM restaurants WHERE id = $1 RETURNING id", [id]);
      if (result.rowCount === 0) {
        notFound(res);
        return;
      }
      send(res, 200, { success: true });
      return;
    }

    if (req.method === "POST" && pathName === "/superadmin/users") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["superadmin"])) return;

      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      const email = normalizeEmail(body.email);
      const role = String(body.role || "admin").trim().toLowerCase();
      const restaurantName = String(body.restaurantName || "").trim();
      const temporaryPassword = String(body.temporaryPassword || "").trim();

      if (!name || !email || !restaurantName || !temporaryPassword) {
        send(res, 400, { error: "name, email, restaurantName and temporaryPassword are required" });
        return;
      }
      if (!isValidEmail(email)) {
        send(res, 400, { error: "Invalid email format" });
        return;
      }
      if (temporaryPassword.length < 8) {
        send(res, 400, { error: "Temporary password must be at least 8 characters" });
        return;
      }
      if (role !== "admin") {
        send(res, 400, { error: "Only admin role is allowed from this endpoint" });
        return;
      }

      const exists = await pool.query("SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1", [email]);
      if (exists.rowCount > 0) {
        send(res, 409, { error: "Email already exists" });
        return;
      }

      const passwordHash = await bcrypt.hash(temporaryPassword, 10);
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3); // 72 hours
      const restaurantRecord = await ensureRestaurantRecord(restaurantName, name, "");
      if (!restaurantRecord) {
        send(res, 400, { error: "Unable to map admin to restaurant" });
        return;
      }

      const insertResult = await pool.query(
        `INSERT INTO users (name, email, password, role, restaurant_name, restaurant_id, is_active, must_change_password, temp_password_expires_at)
         VALUES ($1, $2, $3, 'admin', $4, $5, TRUE, FALSE, $6)
         RETURNING id, name, email, role, restaurant_name, restaurant_id, is_active, must_change_password, temp_password_expires_at, created_at`,
        [name, email, passwordHash, restaurantRecord.name, restaurantRecord.id, expiresAt],
      );

      const created = insertResult.rows[0];

      // Delivery integration placeholder: wire SMTP/SMS provider here for production.
      const credentialsDispatch = {
        email: "queued-demo",
        sms: "not-configured",
      };

      send(res, 201, {
        user: created,
        temporaryCredentialsDispatch: credentialsDispatch,
      });
      return;
    }

    if (req.method === "PATCH" && /^\/superadmin\/users\/\d+$/.test(pathName)) {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["superadmin"])) return;

      const id = Number(pathName.split("/")[3]);
      const body = await parseBody(req);
      const name = body.name ? String(body.name).trim() : null;
      const restaurantName = body.restaurantName ? String(body.restaurantName).trim() : null;
      const isActive = typeof body.isActive === "boolean" ? body.isActive : null;
      let restaurantId = null;

      if (restaurantName) {
        const restaurantRecord = await ensureRestaurantRecord(restaurantName, name || "Unassigned Owner", "");
        restaurantId = restaurantRecord?.id || null;
      }

      const existing = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'admin' LIMIT 1", [id]);
      if (existing.rowCount === 0) {
        notFound(res);
        return;
      }

      const result = await pool.query(
        `UPDATE users
         SET name = COALESCE($1, name),
             restaurant_name = COALESCE($2, restaurant_name),
           restaurant_id = COALESCE($3, restaurant_id),
           is_active = COALESCE($4, is_active),
             updated_at = NOW()
         WHERE id = $5
         RETURNING id, name, email, role, restaurant_name, restaurant_id, is_active, must_change_password, created_at`,
        [name, restaurantName, restaurantId, isActive, id],
      );

      send(res, 200, result.rows[0]);
      return;
    }

    if (req.method === "POST" && /^\/superadmin\/users\/\d+\/reset-password$/.test(pathName)) {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["superadmin"])) return;

      const id = Number(pathName.split("/")[3]);
      const body = await parseBody(req);
      const temporaryPassword = String(body.temporaryPassword || "").trim();
      if (!temporaryPassword || temporaryPassword.length < 8) {
        send(res, 400, { error: "Temporary password must be at least 8 characters" });
        return;
      }

      const adminResult = await pool.query("SELECT id, email FROM users WHERE id = $1 AND role = 'admin' LIMIT 1", [id]);
      if (adminResult.rowCount === 0) {
        notFound(res);
        return;
      }

      const passwordHash = await bcrypt.hash(temporaryPassword, 10);
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3);
      await pool.query(
        `UPDATE users
         SET password = $1,
             must_change_password = FALSE,
             temp_password_expires_at = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [passwordHash, expiresAt, id],
      );

      send(res, 200, {
        success: true,
        temporaryCredentialsDispatch: {
          email: "queued-demo",
          sms: "not-configured",
        },
      });
      return;
    }

    if (req.method === "DELETE" && /^\/superadmin\/users\/\d+$/.test(pathName)) {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["superadmin"])) return;

      const id = Number(pathName.split("/")[3]);
      const result = await pool.query("DELETE FROM users WHERE id = $1 AND role = 'admin' RETURNING id", [id]);
      if (result.rowCount === 0) {
        notFound(res);
        return;
      }
      send(res, 200, { success: true });
      return;
    }

    if (req.method === "GET" && pathName === "/superadmin/subscriptions") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["superadmin"])) return;
      const result = await pool.query(
        `SELECT s.id, s.restaurant_id,
                s.restaurant_name AS name,
                s.owner,
                s.plan,
                CASE
                  WHEN LOWER(s.status) = 'active' THEN 'Active'
                  WHEN LOWER(s.status) = 'inactive' THEN 'Inactive'
                  ELSE INITCAP(s.status)
                END AS status,
                TO_CHAR(s.expiry_date, 'YYYY-MM-DD') AS expiry,
                0::int AS overdue_days,
                CASE WHEN LOWER(s.plan) = 'premium' THEN 'Rs. 48000' ELSE 'Rs. 24000' END AS mrr
         FROM subscriptions s
         ORDER BY s.id DESC`,
      );
      send(res, 200, result.rows);
      return;
    }

    if (req.method === "POST" && pathName === "/superadmin/subscriptions") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["superadmin"])) return;
      const body = await parseBody(req);
      const restaurantName = String(body.restaurantName || "").trim();
      const owner = String(body.owner || "Unassigned Owner").trim();
      const plan = String(body.plan || "Standard").trim();
      const status = String(body.status || "Active").trim();
      const expiry = String(body.expiry || "").trim();

      if (!restaurantName || !expiry) {
        send(res, 400, { error: "restaurantName and expiry are required" });
        return;
      }
      const restaurant = await ensureRestaurantRecord(restaurantName, owner, "");
      if (!restaurant) {
        send(res, 400, { error: "Unable to map subscription to restaurant" });
        return;
      }

      const result = await pool.query(
        `INSERT INTO subscriptions (restaurant_id, restaurant_name, owner, plan, status, expiry_date)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [restaurant.id, restaurantName, owner, plan, status, expiry],
      );
      send(res, 201, { id: result.rows[0].id });
      return;
    }

    if (req.method === "PATCH" && /^\/superadmin\/subscriptions\/\d+$/.test(pathName)) {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["superadmin"])) return;
      const id = Number(pathName.split("/")[3]);
      const body = await parseBody(req);
      const result = await pool.query(
        `UPDATE subscriptions
         SET plan = COALESCE($1, plan),
             status = COALESCE($2, status),
             expiry_date = COALESCE($3, expiry_date)
         WHERE id = $4
         RETURNING id`,
        [
          body.plan ? String(body.plan).trim() : null,
          body.status ? String(body.status).trim() : null,
          body.expiry ? String(body.expiry).trim() : null,
          id,
        ],
      );
      if (result.rowCount === 0) {
        notFound(res);
        return;
      }
      send(res, 200, { success: true });
      return;
    }

    if (req.method === "GET" && pathName === "/superadmin/settings") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["superadmin"])) return;
      const result = await pool.query(
        `SELECT id, restaurant_id, setting_key AS key, description, enabled
         FROM system_settings
         ORDER BY id DESC`,
      );
      send(res, 200, result.rows);
      return;
    }

    if (req.method === "PATCH" && /^\/superadmin\/settings\/\d+$/.test(pathName)) {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["superadmin"])) return;
      const id = Number(pathName.split("/")[3]);
      const body = await parseBody(req);
      if (typeof body.enabled !== "boolean") {
        send(res, 400, { error: "enabled must be boolean" });
        return;
      }
      const result = await pool.query(
        `UPDATE system_settings SET enabled = $1 WHERE id = $2 RETURNING id`,
        [body.enabled, id],
      );
      if (result.rowCount === 0) {
        notFound(res);
        return;
      }
      send(res, 200, { success: true });
      return;
    }

    if (req.method === "GET" && pathName === "/superadmin/support") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["superadmin"])) return;
      const result = await pool.query(
        `SELECT id,
                CONCAT('#', id) AS ticket,
                subject,
                restaurant,
                status,
                'medium'::text AS priority,
                'Unassigned'::text AS assignee,
                CASE WHEN status = 'resolved' THEN 'Met' ELSE '6h left' END AS sla,
                TO_CHAR(created_at, 'YYYY-MM-DD') AS time
         FROM support_tickets
         ORDER BY id DESC`,
      );
      send(res, 200, result.rows);
      return;
    }

    if (req.method === "POST" && pathName === "/superadmin/support") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["superadmin"])) return;
      const body = await parseBody(req);
      const subject = String(body.subject || "").trim();
      const restaurantName = String(body.restaurant || "").trim();
      const status = String(body.status || "open").trim();
      if (!subject || !restaurantName) {
        send(res, 400, { error: "subject and restaurant are required" });
        return;
      }
      const restaurant = await ensureRestaurantRecord(restaurantName, "Unassigned Owner", "");
      if (!restaurant) {
        send(res, 400, { error: "Unable to map support ticket to restaurant" });
        return;
      }

      const result = await pool.query(
        `INSERT INTO support_tickets (restaurant_id, subject, restaurant, status)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [restaurant.id, subject, restaurantName, status],
      );
      send(res, 201, { id: result.rows[0].id });
      return;
    }

    if (req.method === "PATCH" && /^\/superadmin\/support\/\d+$/.test(pathName)) {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["superadmin"])) return;
      const id = Number(pathName.split("/")[3]);
      const body = await parseBody(req);
      const result = await pool.query(
        `UPDATE support_tickets
         SET subject = COALESCE($1, subject),
             restaurant = COALESCE($2, restaurant),
             status = COALESCE($3, status)
         WHERE id = $4
         RETURNING id`,
        [
          body.subject ? String(body.subject).trim() : null,
          body.restaurant ? String(body.restaurant).trim() : null,
          body.status ? String(body.status).trim() : null,
          id,
        ],
      );
      if (result.rowCount === 0) {
        notFound(res);
        return;
      }
      send(res, 200, { success: true });
      return;
    }

    if (req.method === "DELETE" && /^\/superadmin\/support\/\d+$/.test(pathName)) {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["superadmin"])) return;
      const id = Number(pathName.split("/")[3]);
      const result = await pool.query("DELETE FROM support_tickets WHERE id = $1 RETURNING id", [id]);
      if (result.rowCount === 0) {
        notFound(res);
        return;
      }
      send(res, 200, { success: true });
      return;
    }

    if (req.method === "GET" && pathName === "/menu") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const scope = await getActorRestaurantScope(payload);
      const result = scope.isSuperAdmin
        ? await pool.query("SELECT id, name, price, available, restaurant_id FROM menu ORDER BY id ASC")
        : await pool.query("SELECT id, name, price, available, restaurant_id FROM menu WHERE restaurant_id = $1 ORDER BY id ASC", [scope.restaurantId]);
      send(res, 200, result.rows);
      return;
    }

    if (req.method === "POST" && pathName === "/menu") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const body = await parseBody(req);
      const scope = await getActorRestaurantScope(payload);
      const targetRestaurantId = scope.isSuperAdmin ? toNumber(body.restaurantId, null) : scope.restaurantId;
      if (!body.name || toNumber(body.price) <= 0) {
        send(res, 400, { error: "Invalid menu payload" });
        return;
      }
      if (!targetRestaurantId) {
        send(res, 400, { error: "restaurantId is required" });
        return;
      }
      const result = await pool.query(
        "INSERT INTO menu (restaurant_id, name, price, available) VALUES ($1, $2, $3, $4) RETURNING id, name, price, available, restaurant_id",
        [targetRestaurantId, String(body.name).trim(), toNumber(body.price), body.available !== false],
      );
      send(res, 201, result.rows[0]);
      return;
    }

    if (req.method === "PUT" && /^\/menu\/\d+$/.test(pathName)) {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const id = Number(pathName.split("/")[2]);
      const body = await parseBody(req);
      const scope = await getActorRestaurantScope(payload);
      const result = scope.isSuperAdmin
        ? await pool.query(
          "UPDATE menu SET name=$1, price=$2, available=$3 WHERE id=$4 RETURNING id, name, price, available, restaurant_id",
          [String(body.name || "").trim(), toNumber(body.price), body.available !== false, id],
        )
        : await pool.query(
          "UPDATE menu SET name=$1, price=$2, available=$3 WHERE id=$4 AND restaurant_id=$5 RETURNING id, name, price, available, restaurant_id",
          [String(body.name || "").trim(), toNumber(body.price), body.available !== false, id, scope.restaurantId],
        );
      if (result.rowCount === 0) {
        notFound(res);
        return;
      }
      send(res, 200, result.rows[0]);
      return;
    }

    if (req.method === "DELETE" && /^\/menu\/\d+$/.test(pathName)) {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const id = Number(pathName.split("/")[2]);
      const scope = await getActorRestaurantScope(payload);
      const result = scope.isSuperAdmin
        ? await pool.query("DELETE FROM menu WHERE id=$1 RETURNING id", [id])
        : await pool.query("DELETE FROM menu WHERE id=$1 AND restaurant_id=$2 RETURNING id", [id, scope.restaurantId]);
      if (result.rowCount === 0) {
        notFound(res);
        return;
      }
      send(res, 200, { success: true });
      return;
    }

    if (req.method === "GET" && pathName === "/orders") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const scope = await getActorRestaurantScope(payload);
      const result = scope.isSuperAdmin
        ? await pool.query("SELECT id, restaurant_id, user_id, table_number, items, total, status, created_at, updated_at FROM orders ORDER BY id DESC")
        : await pool.query(
          "SELECT id, restaurant_id, user_id, table_number, items, total, status, created_at, updated_at FROM orders WHERE restaurant_id = $1 ORDER BY id DESC",
          [scope.restaurantId],
        );
      send(res, 200, result.rows);
      return;
    }

    if (req.method === "POST" && pathName === "/orders") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const body = await parseBody(req);
      const scope = await getActorRestaurantScope(payload);
      const targetRestaurantId = scope.isSuperAdmin ? toNumber(body.restaurantId, null) : scope.restaurantId;
      if (!Array.isArray(body.items) || body.items.length === 0 || toNumber(body.total) <= 0) {
        send(res, 400, { error: "Invalid order payload" });
        return;
      }
      if (!targetRestaurantId) {
        send(res, 400, { error: "restaurantId is required" });
        return;
      }

      const tableNumber = body.tableNumber === null || body.tableNumber === undefined
        ? null
        : toNumber(body.tableNumber, null);

      const result = await pool.query(
        "INSERT INTO orders (restaurant_id, user_id, table_number, items, total, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, restaurant_id, user_id, table_number, items, total, status, created_at, updated_at",
        [targetRestaurantId, toNumber(body.userId, payload.id), tableNumber, body.items.map((item) => String(item)), toNumber(body.total), "pending"],
      );

      const createdOrder = result.rows[0];

      if (tableNumber !== null) {
        await pool.query(
          `UPDATE restaurant_tables
           SET status = 'occupied',
               current_order = $1,
               reserved_by = NULL,
               occupied_since = COALESCE(occupied_since, NOW()),
               updated_at = NOW()
           WHERE table_number = $2 AND restaurant_id = $3`,
          [`ORD-${createdOrder.id}`, tableNumber, targetRestaurantId],
        );
      }

      send(res, 201, createdOrder);
      return;
    }

    if (req.method === "PATCH" && /^\/orders\/\d+\/status$/.test(pathName)) {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const id = Number(pathName.split("/")[2]);
      const body = await parseBody(req);
      const scope = await getActorRestaurantScope(payload);
      const nextStatus = String(body.status || "pending");
      if (!["pending", "preparing", "ready", "served"].includes(nextStatus)) {
        send(res, 400, { error: "Invalid order status" });
        return;
      }

      const result = scope.isSuperAdmin
        ? await pool.query(
          "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, restaurant_id, user_id, table_number, items, total, status, created_at, updated_at",
          [nextStatus, id],
        )
        : await pool.query(
          "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 AND restaurant_id = $3 RETURNING id, restaurant_id, user_id, table_number, items, total, status, created_at, updated_at",
          [nextStatus, id, scope.restaurantId],
        );
      if (result.rowCount === 0) {
        notFound(res);
        return;
      }
      const updatedOrder = result.rows[0];

      if (nextStatus === "served" && updatedOrder.table_number !== null) {
        await pool.query(
          `UPDATE restaurant_tables
           SET status = 'available',
               current_order = NULL,
               reserved_by = NULL,
               estimated_time = NULL,
               occupied_since = NULL,
               updated_at = NOW()
           WHERE table_number = $1 AND restaurant_id = $2`,
          [updatedOrder.table_number, updatedOrder.restaurant_id],
        );
      }

      send(res, 200, updatedOrder);
      return;
    }

    if (req.method === "GET" && pathName === "/tables") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const scope = await getActorRestaurantScope(payload);
      const result = scope.isSuperAdmin
        ? await pool.query(
        `SELECT id, restaurant_id, table_number, capacity, section, status, current_order, reserved_by,
          CASE WHEN estimated_time IS NULL THEN NULL ELSE CONCAT(estimated_time, ' min') END AS estimated_time,
          occupied_since
         FROM restaurant_tables
         ORDER BY table_number ASC`,
      )
        : await pool.query(
          `SELECT id, restaurant_id, table_number, capacity, section, status, current_order, reserved_by,
            CASE WHEN estimated_time IS NULL THEN NULL ELSE CONCAT(estimated_time, ' min') END AS estimated_time,
            occupied_since
           FROM restaurant_tables
           WHERE restaurant_id = $1
           ORDER BY table_number ASC`,
          [scope.restaurantId],
        );
      send(res, 200, result.rows);
      return;
    }

    if (req.method === "POST" && pathName === "/tables") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const body = await parseBody(req);
      const scope = await getActorRestaurantScope(payload);
      const targetRestaurantId = scope.isSuperAdmin ? toNumber(body.restaurantId, null) : scope.restaurantId;
      const tableNumber = toNumber(body.table_number);
      if (!body.table_number || !body.capacity || !body.section) {
        send(res, 400, { error: "Invalid table payload" });
        return;
      }
      if (!targetRestaurantId) {
        send(res, 400, { error: "restaurantId is required" });
        return;
      }

      const existing = await pool.query(
        "SELECT id FROM restaurant_tables WHERE restaurant_id = $1 AND table_number = $2 LIMIT 1",
        [targetRestaurantId, tableNumber],
      );
      if (existing.rowCount > 0) {
        send(res, 409, { error: "Table number already exists for this restaurant" });
        return;
      }

      const result = await pool.query(
        `INSERT INTO restaurant_tables (restaurant_id, table_number, capacity, section, status)
         VALUES ($1, $2, $3, $4, 'available')
         RETURNING id, restaurant_id, table_number, capacity, section, status, current_order, reserved_by,
                   CASE WHEN estimated_time IS NULL THEN NULL ELSE CONCAT(estimated_time, ' min') END AS estimated_time,
                   occupied_since`,
        [targetRestaurantId, tableNumber, toNumber(body.capacity), String(body.section).trim()],
      );
      send(res, 201, result.rows[0]);
      return;
    }

    if (req.method === "PATCH" && /^\/tables\/\d+\/status$/.test(pathName)) {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const id = Number(pathName.split("/")[2]);
      const body = await parseBody(req);
      const scope = await getActorRestaurantScope(payload);
      const nextStatus = String(body.status || "available");
      const result = scope.isSuperAdmin ? await pool.query(
        `UPDATE restaurant_tables
         SET status=$1,
             occupied_since = CASE
               WHEN $1 = 'occupied' THEN COALESCE(occupied_since, NOW())
               ELSE NULL
             END,
             current_order = CASE
               WHEN $1 = 'available' THEN NULL
               ELSE current_order
             END,
             updated_at=NOW()
         WHERE id=$2
         RETURNING id, restaurant_id, table_number, capacity, section, status, current_order, reserved_by,
                   CASE WHEN estimated_time IS NULL THEN NULL ELSE CONCAT(estimated_time, ' min') END AS estimated_time,
                   occupied_since`,
        [nextStatus, id],
      ) : await pool.query(
        `UPDATE restaurant_tables
         SET status=$1,
             occupied_since = CASE
               WHEN $1 = 'occupied' THEN COALESCE(occupied_since, NOW())
               ELSE NULL
             END,
             current_order = CASE
               WHEN $1 = 'available' THEN NULL
               ELSE current_order
             END,
             updated_at=NOW()
         WHERE id=$2 AND restaurant_id=$3
         RETURNING id, restaurant_id, table_number, capacity, section, status, current_order, reserved_by,
                  CASE WHEN estimated_time IS NULL THEN NULL ELSE CONCAT(estimated_time, ' min') END AS estimated_time,
                  occupied_since`,
        [nextStatus, id, scope.restaurantId],
      );
      if (result.rowCount === 0) {
        notFound(res);
        return;
      }
      send(res, 200, result.rows[0]);
      return;
    }

    if (req.method === "DELETE" && /^\/tables\/\d+$/.test(pathName)) {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const id = Number(pathName.split("/")[2]);
      const scope = await getActorRestaurantScope(payload);
      const result = scope.isSuperAdmin
        ? await pool.query("DELETE FROM restaurant_tables WHERE id=$1 RETURNING id", [id])
        : await pool.query("DELETE FROM restaurant_tables WHERE id=$1 AND restaurant_id=$2 RETURNING id", [id, scope.restaurantId]);
      if (result.rowCount === 0) {
        notFound(res);
        return;
      }
      send(res, 200, { success: true });
      return;
    }

    if (req.method === "GET" && pathName === "/reservations") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const scope = await getActorRestaurantScope(payload);
      const result = scope.isSuperAdmin
        ? await pool.query(
        `SELECT r.id, r.restaurant_id, r.customer_name, r.customer_phone, r.reservation_date, r.reservation_time,
          r.guests, t.id AS table_id, COALESCE(t.table_number::text, 'T1') AS table_number, r.status
         FROM reservations r
         LEFT JOIN restaurant_tables t ON t.id = r.table_id
         ORDER BY r.id DESC`,
      )
        : await pool.query(
          `SELECT r.id, r.restaurant_id, r.customer_name, r.customer_phone, r.reservation_date, r.reservation_time,
            r.guests, t.id AS table_id, COALESCE(t.table_number::text, 'T1') AS table_number, r.status
           FROM reservations r
           LEFT JOIN restaurant_tables t ON t.id = r.table_id
           WHERE r.restaurant_id = $1
           ORDER BY r.id DESC`,
          [scope.restaurantId],
        );
      send(res, 200, result.rows);
      return;
    }

    if (req.method === "POST" && pathName === "/reservations") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const body = await parseBody(req);
      const scope = await getActorRestaurantScope(payload);
      const targetRestaurantId = scope.isSuperAdmin ? toNumber(body.restaurantId, null) : scope.restaurantId;
      if (!body.customer_name || !body.customer_phone || !body.reservation_date || !body.reservation_time) {
        send(res, 400, { error: "Invalid reservation payload" });
        return;
      }
      if (!targetRestaurantId) {
        send(res, 400, { error: "restaurantId is required" });
        return;
      }

      const tableNumber = extractTableNumber(body.table_number);
      let tableId = null;
      if (tableNumber !== null) {
        const tableResult = await pool.query(
          "SELECT id FROM restaurant_tables WHERE table_number=$1 AND restaurant_id=$2 LIMIT 1",
          [tableNumber, targetRestaurantId],
        );
        tableId = tableResult.rows[0]?.id || null;
      }

      const result = await pool.query(
        `INSERT INTO reservations
         (restaurant_id, customer_name, customer_phone, reservation_date, reservation_time, guests, table_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, restaurant_id, customer_name, customer_phone, reservation_date, reservation_time, guests,
                   $7 AS table_id, COALESCE($9::text, 'T1') AS table_number, status`,
        [
          targetRestaurantId,
          String(body.customer_name).trim(),
          String(body.customer_phone).trim(),
          String(body.reservation_date),
          String(body.reservation_time),
          toNumber(body.guests, 1),
          tableId,
          String(body.status || "pending"),
          tableNumber,
        ],
      );
      send(res, 201, result.rows[0]);
      return;
    }

    if (req.method === "PATCH" && /^\/reservations\/\d+\/status$/.test(pathName)) {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const id = Number(pathName.split("/")[2]);
      const body = await parseBody(req);
      const scope = await getActorRestaurantScope(payload);
      const status = String(body.status || "pending");
      const result = scope.isSuperAdmin ? await pool.query(
        `UPDATE reservations
         SET status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, restaurant_id, customer_name, customer_phone, reservation_date, reservation_time, guests, table_id, status`,
        [status, id],
      ) : await pool.query(
        `UPDATE reservations
         SET status = $1, updated_at = NOW()
         WHERE id = $2 AND restaurant_id = $3
         RETURNING id, restaurant_id, customer_name, customer_phone, reservation_date, reservation_time, guests, table_id, status`,
        [status, id, scope.restaurantId],
      );
      if (result.rowCount === 0) {
        notFound(res);
        return;
      }
      const row = result.rows[0];
      let tableNumber = "T1";
      if (row.table_id) {
        const tableResult = await pool.query("SELECT table_number FROM restaurant_tables WHERE id = $1 AND restaurant_id = $2 LIMIT 1", [row.table_id, row.restaurant_id]);
        if (tableResult.rowCount > 0) tableNumber = String(tableResult.rows[0].table_number);
      }
      send(res, 200, {
        ...row,
        table_number: tableNumber,
      });
      return;
    }

    if (req.method === "GET" && pathName === "/deliveries") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const scope = await getActorRestaurantScope(payload);
      const result = scope.isSuperAdmin ? await pool.query(
        `SELECT id, order_number, customer_name, customer_phone AS phone,
                customer_address AS address, partner, order_total AS amount, restaurant_id,
                COALESCE(driver_name, 'Unassigned') AS driver, status
         FROM deliveries
         ORDER BY id DESC`,
      ) : await pool.query(
        `SELECT id, order_number, customer_name, customer_phone AS phone,
                customer_address AS address, partner, order_total AS amount, restaurant_id,
                COALESCE(driver_name, 'Unassigned') AS driver, status
         FROM deliveries
         WHERE restaurant_id = $1
         ORDER BY id DESC`,
        [scope.restaurantId],
      );
      send(res, 200, result.rows);
      return;
    }

    if (req.method === "POST" && pathName === "/deliveries") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const body = await parseBody(req);
      const scope = await getActorRestaurantScope(payload);
      const targetRestaurantId = scope.isSuperAdmin ? toNumber(body.restaurantId, null) : scope.restaurantId;
      if (!body.order_number || !body.customer_name || !body.phone || !body.address) {
        send(res, 400, { error: "Invalid delivery payload" });
        return;
      }
      if (!targetRestaurantId) {
        send(res, 400, { error: "restaurantId is required" });
        return;
      }
      const result = await pool.query(
        `INSERT INTO deliveries
         (restaurant_id, order_number, customer_name, customer_phone, customer_address, status, driver_name, partner, order_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, order_number, customer_name, customer_phone AS phone,
                   customer_address AS address, partner, order_total AS amount, restaurant_id,
                   COALESCE(driver_name, 'Unassigned') AS driver, status`,
        [
          targetRestaurantId,
          String(body.order_number).trim().toUpperCase(),
          String(body.customer_name).trim(),
          String(body.phone).trim(),
          String(body.address).trim(),
          String(body.status || "pending"),
          String(body.driver || "Unassigned"),
          String(body.partner || "in-house"),
          toNumber(body.amount),
        ],
      );
      send(res, 201, result.rows[0]);
      return;
    }

    if (req.method === "PATCH" && /^\/deliveries\/\d+\/status$/.test(pathName)) {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const id = Number(pathName.split("/")[2]);
      const body = await parseBody(req);
      const scope = await getActorRestaurantScope(payload);
      const result = scope.isSuperAdmin
        ? await pool.query(
          "UPDATE deliveries SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING id, restaurant_id, status",
          [String(body.status || "pending"), id],
        )
        : await pool.query(
          "UPDATE deliveries SET status=$1, updated_at=NOW() WHERE id=$2 AND restaurant_id=$3 RETURNING id, restaurant_id, status",
          [String(body.status || "pending"), id, scope.restaurantId],
        );
      if (result.rowCount === 0) {
        notFound(res);
        return;
      }
      send(res, 200, result.rows[0]);
      return;
    }

    if (req.method === "GET" && pathName === "/pos/transactions") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const scope = await getActorRestaurantScope(payload);
      const result = scope.isSuperAdmin ? await pool.query(
        `SELECT id, order_number, items, subtotal, tax, total, payment_method, created_at
         FROM pos_transactions
         ORDER BY id DESC`,
      ) : await pool.query(
        `SELECT id, order_number, items, subtotal, tax, total, payment_method, created_at
         FROM pos_transactions
         WHERE restaurant_id = $1
         ORDER BY id DESC`,
        [scope.restaurantId],
      );
      send(res, 200, result.rows);
      return;
    }

    if (req.method === "POST" && pathName === "/pos/transactions") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const body = await parseBody(req);
      const scope = await getActorRestaurantScope(payload);
      const targetRestaurantId = scope.isSuperAdmin ? toNumber(body.restaurantId, null) : scope.restaurantId;
      if (!Array.isArray(body.items) || body.items.length === 0 || toNumber(body.total) <= 0) {
        send(res, 400, { error: "Invalid POS payload" });
        return;
      }
      if (!targetRestaurantId) {
        send(res, 400, { error: "restaurantId is required" });
        return;
      }
      const orderNumber = `POS-${Date.now()}`;
      const result = await pool.query(
        `INSERT INTO pos_transactions
         (restaurant_id, order_number, items, subtotal, tax, total, payment_method, payment_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed')
         RETURNING id, order_number, items, subtotal, tax, total, payment_method, created_at, restaurant_id`,
        [
          targetRestaurantId,
          orderNumber,
          JSON.stringify(body.items),
          toNumber(body.subtotal),
          toNumber(body.tax),
          toNumber(body.total),
          String(body.payment_method || "cash"),
        ],
      );
      send(res, 201, result.rows[0]);
      return;
    }

    if (req.method === "GET" && pathName === "/crm/customers") {
      const auth = await requireTenantScope(req, res, ["admin", "superadmin"]);
      if (!auth) return;
      const { scope } = auth;
      const result = await withTenantFilter(
        scope,
        `SELECT id, restaurant_id, name, email, phone, visits, total_spent, vip, last_visit, created_at
         FROM crm_customers
         ORDER BY id DESC`,
        `SELECT id, restaurant_id, name, email, phone, visits, total_spent, vip, last_visit, created_at
         FROM crm_customers
         WHERE restaurant_id = $1
         ORDER BY id DESC`,
      );
      send(res, 200, result.rows);
      return;
    }

    if (req.method === "POST" && pathName === "/crm/customers") {
      const auth = await requireTenantScope(req, res, ["admin", "superadmin"]);
      if (!auth) return;
      const { scope } = auth;
      const body = await parseBody(req);
      const targetRestaurantId = scope.isSuperAdmin ? toNumber(body.restaurantId, null) : scope.restaurantId;
      const name = String(body.name || "").trim();
      const email = normalizeEmail(body.email);
      const phone = String(body.phone || "").trim();

      if (!name || !email || !phone || !targetRestaurantId) {
        send(res, 400, { error: "name, email, phone and restaurantId are required" });
        return;
      }

      const result = await pool.query(
        `INSERT INTO crm_customers (restaurant_id, name, email, phone, visits, total_spent, vip, last_visit, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         RETURNING id, restaurant_id, name, email, phone, visits, total_spent, vip, last_visit, created_at`,
        [
          targetRestaurantId,
          name,
          email,
          phone,
          toNumber(body.visits, 0),
          toNumber(body.totalSpent, 0),
          Boolean(body.vip),
        ],
      );
      send(res, 201, result.rows[0]);
      return;
    }

    if (req.method === "PATCH" && /^\/crm\/customers\/\d+$/.test(pathName)) {
      const auth = await requireTenantScope(req, res, ["admin", "superadmin"]);
      if (!auth) return;
      const { scope } = auth;
      const id = Number(pathName.split("/")[3]);
      const body = await parseBody(req);

      const result = scope.isSuperAdmin
        ? await pool.query(
          `UPDATE crm_customers
           SET name = COALESCE($1, name),
               email = COALESCE($2, email),
               phone = COALESCE($3, phone),
               visits = COALESCE($4, visits),
               total_spent = COALESCE($5, total_spent),
               vip = COALESCE($6, vip),
               last_visit = NOW(),
               updated_at = NOW()
           WHERE id = $7
           RETURNING id, restaurant_id, name, email, phone, visits, total_spent, vip, last_visit, created_at`,
          [
            body.name ? String(body.name).trim() : null,
            body.email ? normalizeEmail(body.email) : null,
            body.phone ? String(body.phone).trim() : null,
            body.visits === undefined ? null : toNumber(body.visits, 0),
            body.totalSpent === undefined ? null : toNumber(body.totalSpent, 0),
            typeof body.vip === "boolean" ? body.vip : null,
            id,
          ],
        )
        : await pool.query(
          `UPDATE crm_customers
           SET name = COALESCE($1, name),
               email = COALESCE($2, email),
               phone = COALESCE($3, phone),
               visits = COALESCE($4, visits),
               total_spent = COALESCE($5, total_spent),
               vip = COALESCE($6, vip),
               last_visit = NOW(),
               updated_at = NOW()
           WHERE id = $7 AND restaurant_id = $8
           RETURNING id, restaurant_id, name, email, phone, visits, total_spent, vip, last_visit, created_at`,
          [
            body.name ? String(body.name).trim() : null,
            body.email ? normalizeEmail(body.email) : null,
            body.phone ? String(body.phone).trim() : null,
            body.visits === undefined ? null : toNumber(body.visits, 0),
            body.totalSpent === undefined ? null : toNumber(body.totalSpent, 0),
            typeof body.vip === "boolean" ? body.vip : null,
            id,
            scope.restaurantId,
          ],
        );

      if (result.rowCount === 0) {
        notFound(res);
        return;
      }
      send(res, 200, result.rows[0]);
      return;
    }

    if (req.method === "DELETE" && /^\/crm\/customers\/\d+$/.test(pathName)) {
      const auth = await requireTenantScope(req, res, ["admin", "superadmin"]);
      if (!auth) return;
      const { scope } = auth;
      const id = Number(pathName.split("/")[3]);
      const result = scope.isSuperAdmin
        ? await pool.query("DELETE FROM crm_customers WHERE id = $1 RETURNING id", [id])
        : await pool.query("DELETE FROM crm_customers WHERE id = $1 AND restaurant_id = $2 RETURNING id", [id, scope.restaurantId]);
      if (result.rowCount === 0) {
        notFound(res);
        return;
      }
      send(res, 200, { success: true });
      return;
    }

    if (req.method === "GET" && pathName === "/recipes") {
      const auth = await requireTenantScope(req, res, ["admin", "superadmin"]);
      if (!auth) return;
      const { scope } = auth;
      const result = await withTenantFilter(
        scope,
        `SELECT id, restaurant_id, name, category, prep_time, stock, image, ingredients, created_at
         FROM recipes ORDER BY id DESC`,
        `SELECT id, restaurant_id, name, category, prep_time, stock, image, ingredients, created_at
         FROM recipes
         WHERE restaurant_id = $1
         ORDER BY id DESC`,
      );
      send(res, 200, result.rows);
      return;
    }

    if (req.method === "POST" && pathName === "/recipes") {
      const auth = await requireTenantScope(req, res, ["admin", "superadmin"]);
      if (!auth) return;
      const { scope } = auth;
      const body = await parseBody(req);
      const targetRestaurantId = scope.isSuperAdmin ? toNumber(body.restaurantId, null) : scope.restaurantId;
      const name = String(body.name || "").trim();
      const category = String(body.category || "").trim();
      const prepTime = toNumber(body.prepTime, 0);
      if (!name || !category || prepTime <= 0 || !targetRestaurantId) {
        send(res, 400, { error: "name, category, prepTime and restaurantId are required" });
        return;
      }

      const result = await pool.query(
        `INSERT INTO recipes (restaurant_id, name, category, prep_time, stock, image, ingredients, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         RETURNING id, restaurant_id, name, category, prep_time, stock, image, ingredients, created_at`,
        [
          targetRestaurantId,
          name,
          category,
          prepTime,
          String(body.stock || "Available"),
          String(body.image || "").trim(),
          String(body.ingredients || "").trim(),
        ],
      );
      send(res, 201, result.rows[0]);
      return;
    }

    if (req.method === "PATCH" && /^\/recipes\/\d+$/.test(pathName)) {
      const auth = await requireTenantScope(req, res, ["admin", "superadmin"]);
      if (!auth) return;
      const { scope } = auth;
      const id = Number(pathName.split("/")[2]);
      const body = await parseBody(req);
      const result = scope.isSuperAdmin
        ? await pool.query(
          `UPDATE recipes
           SET name = COALESCE($1, name),
               category = COALESCE($2, category),
               prep_time = COALESCE($3, prep_time),
               stock = COALESCE($4, stock),
               image = COALESCE($5, image),
               ingredients = COALESCE($6, ingredients),
               updated_at = NOW()
           WHERE id = $7
           RETURNING id, restaurant_id, name, category, prep_time, stock, image, ingredients, created_at`,
          [
            body.name ? String(body.name).trim() : null,
            body.category ? String(body.category).trim() : null,
            body.prepTime === undefined ? null : toNumber(body.prepTime, 0),
            body.stock ? String(body.stock).trim() : null,
            body.image ? String(body.image).trim() : null,
            body.ingredients ? String(body.ingredients).trim() : null,
            id,
          ],
        )
        : await pool.query(
          `UPDATE recipes
           SET name = COALESCE($1, name),
               category = COALESCE($2, category),
               prep_time = COALESCE($3, prep_time),
               stock = COALESCE($4, stock),
               image = COALESCE($5, image),
               ingredients = COALESCE($6, ingredients),
               updated_at = NOW()
           WHERE id = $7 AND restaurant_id = $8
           RETURNING id, restaurant_id, name, category, prep_time, stock, image, ingredients, created_at`,
          [
            body.name ? String(body.name).trim() : null,
            body.category ? String(body.category).trim() : null,
            body.prepTime === undefined ? null : toNumber(body.prepTime, 0),
            body.stock ? String(body.stock).trim() : null,
            body.image ? String(body.image).trim() : null,
            body.ingredients ? String(body.ingredients).trim() : null,
            id,
            scope.restaurantId,
          ],
        );

      if (result.rowCount === 0) {
        notFound(res);
        return;
      }
      send(res, 200, result.rows[0]);
      return;
    }

    if (req.method === "DELETE" && /^\/recipes\/\d+$/.test(pathName)) {
      const auth = await requireTenantScope(req, res, ["admin", "superadmin"]);
      if (!auth) return;
      const { scope } = auth;
      const id = Number(pathName.split("/")[2]);
      const result = scope.isSuperAdmin
        ? await pool.query("DELETE FROM recipes WHERE id = $1 RETURNING id", [id])
        : await pool.query("DELETE FROM recipes WHERE id = $1 AND restaurant_id = $2 RETURNING id", [id, scope.restaurantId]);
      if (result.rowCount === 0) {
        notFound(res);
        return;
      }
      send(res, 200, { success: true });
      return;
    }

    if (req.method === "GET" && pathName === "/reports/overview") {
      const auth = await requireTenantScope(req, res, ["admin", "superadmin"]);
      if (!auth) return;
      const { scope } = auth;

      const baseFilter = scope.isSuperAdmin ? "" : "WHERE restaurant_id = $1";
      const params = scope.isSuperAdmin ? [] : [scope.restaurantId];

      const [revenueRes, orderRes, customerRes, topMenuRes] = await Promise.all([
        pool.query(`SELECT COALESCE(SUM(total), 0)::float AS revenue FROM orders ${baseFilter}`, params),
        pool.query(`SELECT COUNT(*)::int AS total_orders FROM orders ${baseFilter}`, params),
        pool.query(`SELECT COUNT(*)::int AS total_customers FROM crm_customers ${baseFilter}`, params),
        pool.query(
          `SELECT name, COUNT(*)::int AS orders
           FROM (
             SELECT UNNEST(items) AS name
             FROM orders ${baseFilter}
           ) flat
           GROUP BY name
           ORDER BY orders DESC
           LIMIT 5`,
          params,
        ),
      ]);

      send(res, 200, {
        revenue: revenueRes.rows[0]?.revenue || 0,
        totalOrders: orderRes.rows[0]?.total_orders || 0,
        totalCustomers: customerRes.rows[0]?.total_customers || 0,
        topItems: topMenuRes.rows,
      });
      return;
    }

    if (req.method === "GET" && pathName === "/inventory") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const scope = await getActorRestaurantScope(payload);
      const result = scope.isSuperAdmin
        ? await pool.query(
          `SELECT id, restaurant_id, name, unit,
                  quantity AS stock,
                  min_stock,
                  max_stock,
                  category,
                  updated_at
           FROM inventory
           ORDER BY id DESC`,
        )
        : await pool.query(
          `SELECT id, restaurant_id, name, unit,
                  quantity AS stock,
                  min_stock,
                  max_stock,
                  category,
                  updated_at
           FROM inventory
           WHERE restaurant_id = $1
           ORDER BY id DESC`,
          [scope.restaurantId],
        );
      send(res, 200, result.rows);
      return;
    }

    if (req.method === "POST" && pathName === "/inventory") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const body = await parseBody(req);
      const scope = await getActorRestaurantScope(payload);
      const targetRestaurantId = scope.isSuperAdmin ? toNumber(body.restaurantId, null) : scope.restaurantId;
      const name = String(body.name || "").trim();
      const unit = String(body.unit || "").trim();
      const category = String(body.category || "General").trim();
      const stock = toNumber(body.stock, 0);
      const minStock = toNumber(body.minStock, 0);
      const maxStock = toNumber(body.maxStock, 0);

      if (!name || !unit || !targetRestaurantId) {
        send(res, 400, { error: "name, unit and restaurantId are required" });
        return;
      }

      const result = await pool.query(
        `INSERT INTO inventory (restaurant_id, name, quantity, unit, min_stock, max_stock, category, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING id, restaurant_id, name, unit,
                   quantity AS stock,
                   min_stock,
                   max_stock,
                   category,
                   updated_at`,
        [targetRestaurantId, name, stock, unit, minStock, maxStock, category],
      );
      send(res, 201, result.rows[0]);
      return;
    }

    if (req.method === "PATCH" && /^\/inventory\/\d+$/.test(pathName)) {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const id = Number(pathName.split("/")[2]);
      const body = await parseBody(req);
      const scope = await getActorRestaurantScope(payload);

      const result = scope.isSuperAdmin
        ? await pool.query(
          `UPDATE inventory
           SET name = COALESCE($1, name),
               quantity = COALESCE($2, quantity),
               unit = COALESCE($3, unit),
               min_stock = COALESCE($4, min_stock),
               max_stock = COALESCE($5, max_stock),
               category = COALESCE($6, category),
               updated_at = NOW()
           WHERE id = $7
           RETURNING id, restaurant_id, name, unit,
                     quantity AS stock,
                     min_stock,
                     max_stock,
                     category,
                     updated_at`,
          [
            body.name ? String(body.name).trim() : null,
            body.stock === undefined ? null : toNumber(body.stock, 0),
            body.unit ? String(body.unit).trim() : null,
            body.minStock === undefined ? null : toNumber(body.minStock, 0),
            body.maxStock === undefined ? null : toNumber(body.maxStock, 0),
            body.category ? String(body.category).trim() : null,
            id,
          ],
        )
        : await pool.query(
          `UPDATE inventory
           SET name = COALESCE($1, name),
               quantity = COALESCE($2, quantity),
               unit = COALESCE($3, unit),
               min_stock = COALESCE($4, min_stock),
               max_stock = COALESCE($5, max_stock),
               category = COALESCE($6, category),
               updated_at = NOW()
           WHERE id = $7 AND restaurant_id = $8
           RETURNING id, restaurant_id, name, unit,
                     quantity AS stock,
                     min_stock,
                     max_stock,
                     category,
                     updated_at`,
          [
            body.name ? String(body.name).trim() : null,
            body.stock === undefined ? null : toNumber(body.stock, 0),
            body.unit ? String(body.unit).trim() : null,
            body.minStock === undefined ? null : toNumber(body.minStock, 0),
            body.maxStock === undefined ? null : toNumber(body.maxStock, 0),
            body.category ? String(body.category).trim() : null,
            id,
            scope.restaurantId,
          ],
        );

      if (result.rowCount === 0) {
        notFound(res);
        return;
      }
      send(res, 200, result.rows[0]);
      return;
    }

    if (req.method === "GET" && pathName === "/payroll/staff") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const scope = await getActorRestaurantScope(payload);
      const result = scope.isSuperAdmin
        ? await pool.query(
          `SELECT id, restaurant_id, name, role, present, leaves, salary
           FROM payroll_staff
           ORDER BY id DESC`,
        )
        : await pool.query(
          `SELECT id, restaurant_id, name, role, present, leaves, salary
           FROM payroll_staff
           WHERE restaurant_id = $1
           ORDER BY id DESC`,
          [scope.restaurantId],
        );
      send(res, 200, result.rows);
      return;
    }

    if (req.method === "POST" && pathName === "/payroll/staff") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const body = await parseBody(req);
      const scope = await getActorRestaurantScope(payload);
      const targetRestaurantId = scope.isSuperAdmin ? toNumber(body.restaurantId, null) : scope.restaurantId;

      const name = String(body.name || "").trim();
      const role = String(body.role || "").trim();
      const salary = toNumber(body.salary, 0);
      const present = typeof body.present === "boolean" ? body.present : true;
      const leaves = toNumber(body.leaves, 0);

      if (!name || !role || salary < 0 || !targetRestaurantId) {
        send(res, 400, { error: "name, role, salary and restaurantId are required" });
        return;
      }

      const result = await pool.query(
        `INSERT INTO payroll_staff (restaurant_id, name, role, present, leaves, salary, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         RETURNING id, restaurant_id, name, role, present, leaves, salary`,
        [targetRestaurantId, name, role, present, leaves, salary],
      );

      send(res, 201, result.rows[0]);
      return;
    }

    if (req.method === "PATCH" && /^\/payroll\/staff\/\d+$/.test(pathName)) {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const id = Number(pathName.split("/")[3]);
      const body = await parseBody(req);
      const scope = await getActorRestaurantScope(payload);

      const result = scope.isSuperAdmin
        ? await pool.query(
          `UPDATE payroll_staff
           SET name = COALESCE($1, name),
               role = COALESCE($2, role),
               present = COALESCE($3, present),
               leaves = COALESCE($4, leaves),
               salary = COALESCE($5, salary),
               updated_at = NOW()
           WHERE id = $6
           RETURNING id, restaurant_id, name, role, present, leaves, salary`,
          [
            body.name ? String(body.name).trim() : null,
            body.role ? String(body.role).trim() : null,
            typeof body.present === "boolean" ? body.present : null,
            body.leaves === undefined ? null : toNumber(body.leaves, 0),
            body.salary === undefined ? null : toNumber(body.salary, 0),
            id,
          ],
        )
        : await pool.query(
          `UPDATE payroll_staff
           SET name = COALESCE($1, name),
               role = COALESCE($2, role),
               present = COALESCE($3, present),
               leaves = COALESCE($4, leaves),
               salary = COALESCE($5, salary),
               updated_at = NOW()
           WHERE id = $6 AND restaurant_id = $7
           RETURNING id, restaurant_id, name, role, present, leaves, salary`,
          [
            body.name ? String(body.name).trim() : null,
            body.role ? String(body.role).trim() : null,
            typeof body.present === "boolean" ? body.present : null,
            body.leaves === undefined ? null : toNumber(body.leaves, 0),
            body.salary === undefined ? null : toNumber(body.salary, 0),
            id,
            scope.restaurantId,
          ],
        );

      if (result.rowCount === 0) {
        notFound(res);
        return;
      }
      send(res, 200, result.rows[0]);
      return;
    }

    if (req.method === "GET" && pathName === "/tasks") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const scope = await getActorRestaurantScope(payload);
      const result = scope.isSuperAdmin
        ? await pool.query(
          `SELECT id, restaurant_id, title, assigned_to, status, created_at
           FROM tasks
           ORDER BY id DESC`,
        )
        : await pool.query(
          `SELECT id, restaurant_id, title, assigned_to, status, created_at
           FROM tasks
           WHERE restaurant_id = $1
           ORDER BY id DESC`,
          [scope.restaurantId],
        );
      send(res, 200, result.rows);
      return;
    }

    if (req.method === "POST" && pathName === "/tasks") {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const body = await parseBody(req);
      const scope = await getActorRestaurantScope(payload);
      const targetRestaurantId = scope.isSuperAdmin ? toNumber(body.restaurantId, null) : scope.restaurantId;
      const title = String(body.title || "").trim();
      const assignedTo = String(body.assignedTo || "").trim();
      const status = String(body.status || "Pending").trim();

      if (!title || !assignedTo || !targetRestaurantId) {
        send(res, 400, { error: "title, assignedTo and restaurantId are required" });
        return;
      }
      if (!["Pending", "In Progress", "Completed"].includes(status)) {
        send(res, 400, { error: "Invalid task status" });
        return;
      }

      const result = await pool.query(
        `INSERT INTO tasks (restaurant_id, title, assigned_to, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING id, restaurant_id, title, assigned_to, status, created_at`,
        [targetRestaurantId, title, assignedTo, status],
      );
      send(res, 201, result.rows[0]);
      return;
    }

    if (req.method === "PATCH" && /^\/tasks\/\d+$/.test(pathName)) {
      const payload = getTokenPayload(req);
      if (!requireRoles(res, payload, ["admin", "superadmin"])) return;
      const id = Number(pathName.split("/")[2]);
      const body = await parseBody(req);
      const scope = await getActorRestaurantScope(payload);

      const nextStatus = body.status ? String(body.status).trim() : null;
      if (nextStatus && !["Pending", "In Progress", "Completed"].includes(nextStatus)) {
        send(res, 400, { error: "Invalid task status" });
        return;
      }

      const result = scope.isSuperAdmin
        ? await pool.query(
          `UPDATE tasks
           SET title = COALESCE($1, title),
               assigned_to = COALESCE($2, assigned_to),
               status = COALESCE($3, status),
               updated_at = NOW()
           WHERE id = $4
           RETURNING id, restaurant_id, title, assigned_to, status, created_at`,
          [
            body.title ? String(body.title).trim() : null,
            body.assignedTo ? String(body.assignedTo).trim() : null,
            nextStatus,
            id,
          ],
        )
        : await pool.query(
          `UPDATE tasks
           SET title = COALESCE($1, title),
               assigned_to = COALESCE($2, assigned_to),
               status = COALESCE($3, status),
               updated_at = NOW()
           WHERE id = $4 AND restaurant_id = $5
           RETURNING id, restaurant_id, title, assigned_to, status, created_at`,
          [
            body.title ? String(body.title).trim() : null,
            body.assignedTo ? String(body.assignedTo).trim() : null,
            nextStatus,
            id,
            scope.restaurantId,
          ],
        );

      if (result.rowCount === 0) {
        notFound(res);
        return;
      }
      send(res, 200, result.rows[0]);
      return;
    }

    notFound(res);
  } catch (error) {
    send(res, 500, { error: error instanceof Error ? error.message : "Server error" });
  }
});

initializeDatabase()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`PostgreSQL backend running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start PostgreSQL backend:", error);
    process.exit(1);
  });
