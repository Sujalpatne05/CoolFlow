import crypto from "node:crypto";

const TENANT_TYPES = ["cafe", "restaurant", "lodging"];
const USER_ROLES = ["superadmin", "admin", "manager", "staff", "receptionist", "housekeeping", "cashier", "chef"];
const SUBSCRIPTION_STATUSES = ["active", "grace", "suspended", "inactive", "expired"];
const PAYMENT_PROVIDERS = ["paytm", "razorpay"];

const toNumber = (value) => Number(value || 0);
const toDate = (value) => value ? new Date(value).toISOString().slice(0, 10) : null;
const toTimestamp = (value) => value ? new Date(value).toISOString() : null;
const mask = (value) => value ? "************" : null;
const isActive = (value) => String(value || "").toLowerCase() === "active";
const externalOrderType = (value) => value === "take-away" ? "takeaway" : value;
const storageOrderType = (value) => value === "takeaway" ? "take-away" : value;
const externalPaymentStatus = (value) => ["paid", "completed"].includes(String(value).toLowerCase()) ? "paid" : "unpaid";
const storageSubscriptionStatus = (value) => `${value[0].toUpperCase()}${value.slice(1)}`;
const displaySubscriptionStatus = (value) => storageSubscriptionStatus(String(value || "inactive").toLowerCase());

const slugify = (value) => String(value || "")
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9\s-]/g, "")
  .replace(/\s+/g, "-")
  .replace(/-+/g, "-")
  .replace(/^-|-$/g, "");

const idFrom = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const requireId = (send, res, value, label = "id") => {
  const id = idFrom(value);
  if (!id) send(res, 400, { error: `Invalid ${label}` });
  return id;
};

const validatedTenantType = (value = "restaurant") => {
  const type = String(value).toLowerCase();
  return TENANT_TYPES.includes(type) ? type : null;
};

const validatedSubscriptionStatus = (value) => {
  const status = String(value || "").toLowerCase();
  return SUBSCRIPTION_STATUSES.includes(status) ? status : null;
};

const formatTenant = (row) => ({
  id: row.id,
  name: row.name,
  slug: row.slug || `tenant-${row.id}`,
  type: row.tenant_type || "restaurant",
  status: isActive(row.status) ? "active" : "paused",
  logoUrl: row.logo_url || null,
  address: row.address || row.city || null,
  phone: row.phone || null,
  ownerName: row.owner || null,
  ownerEmail: row.resolved_owner_email || null,
  createdAt: toTimestamp(row.created_at),
  subscription: row.subscription_id ? {
    id: row.subscription_id,
    plan: row.subscription_plan,
    status: String(row.subscription_status || "inactive").toLowerCase(),
    expiryDate: toDate(row.subscription_expiry_date),
  } : null,
  payment: {
    provider: row.payment_provider || null,
    isConfigured: Boolean(row.payment_provider),
    isActive: Boolean(row.payment_is_active),
  },
});

const formatUser = (row, temporaryPassword) => ({
  id: row.id,
  tenantId: row.restaurant_id || null,
  tenantName: row.tenant_name || row.restaurant_name || null,
  tenantType: row.tenant_type || null,
  name: row.name,
  email: row.email,
  role: row.role,
  status: row.is_active ? "active" : "inactive",
  passwordResetRequired: Boolean(row.must_change_password),
  createdAt: toTimestamp(row.created_at),
  temporaryPassword,
  restaurant_id: row.restaurant_id || null,
  restaurant_name: row.tenant_name || row.restaurant_name || null,
  is_active: Boolean(row.is_active),
  must_change_password: Boolean(row.must_change_password),
});

const formatSubscription = (row) => {
  const expiryDate = toDate(row.expiry_date);
  const gracePeriodDays = toNumber(row.grace_period_days);
  const overdueDays = expiryDate
    ? Math.max(Math.floor((Date.now() - new Date(`${expiryDate}T00:00:00Z`).getTime()) / 86400000), 0)
    : 0;
  const status = String(row.status || "inactive").toLowerCase();
  return {
    id: row.id,
    tenantId: row.restaurant_id,
    tenantName: row.tenant_name || row.restaurant_name,
    tenantType: row.tenant_type || "restaurant",
    ownerName: row.owner || null,
    plan: row.plan,
    status: displaySubscriptionStatus(status),
    normalizedStatus: status,
    startDate: toDate(row.start_date),
    expiryDate,
    gracePeriodDays,
    overdueDays,
    riskStatus: ["suspended", "expired"].includes(status) || overdueDays > gracePeriodDays ? "high" : overdueDays ? "medium" : "low",
    restaurant_id: row.restaurant_id,
    restaurant_name: row.tenant_name || row.restaurant_name,
    name: row.tenant_name || row.restaurant_name,
    owner: row.owner,
    expiry: expiryDate,
    expiry_date: expiryDate,
    subscription_date: toDate(row.start_date),
    created_at: toDate(row.start_date),
    mrr: row.mrr,
  };
};

const formatPayment = (row) => row ? ({
  id: row.id,
  tenantId: row.restaurant_id,
  tenantName: row.tenant_name,
  provider: row.provider,
  keyId: row.key_id,
  keySecretMasked: mask(row.key_secret),
  webhookSecretMasked: mask(row.webhook_secret),
  webhookConfigured: Boolean(row.webhook_secret),
  website: row.website || null,
  isActive: Boolean(row.is_active),
  createdAt: toTimestamp(row.created_at),
}) : null;

export async function ensureUnifiedSuperadminSchema(pool) {
  await pool.query(`
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS slug TEXT;
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS tenant_type TEXT DEFAULT 'restaurant';
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS address TEXT;
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS owner_email TEXT;
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS logo_url TEXT;

    UPDATE restaurants SET slug = 'tenant-' || id WHERE slug IS NULL OR TRIM(slug) = '';
    CREATE UNIQUE INDEX IF NOT EXISTS restaurants_slug_uidx ON restaurants (LOWER(slug));

    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('user', 'superadmin', 'admin', 'manager', 'staff', 'receptionist', 'housekeeping', 'cashier', 'chef'));

    ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'dine-in';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT;

    ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS start_date DATE;
    ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS grace_period_days INTEGER DEFAULT 0;
    ALTER TABLE restaurants DROP CONSTRAINT IF EXISTS restaurants_plan_check;
    ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
    ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
      CHECK (LOWER(status) IN ('active', 'grace', 'suspended', 'inactive', 'expired'));

    CREATE TABLE IF NOT EXISTS payment_configs (
      id SERIAL PRIMARY KEY,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      key_id TEXT NOT NULL,
      key_secret TEXT NOT NULL,
      webhook_secret TEXT,
      website TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (restaurant_id, provider)
    );

    CREATE TABLE IF NOT EXISTS tenant_expenses (
      id SERIAL PRIMARY KEY,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      amount NUMERIC(10,2) NOT NULL,
      category TEXT,
      incurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

export async function handleUnifiedSuperadmin(context) {
  const { req, res, url, pathName, pool, send, parseBody, getTokenPayload, requireRoles, bcrypt } = context;
  if (!pathName.startsWith("/superadmin/")) return false;

  const payload = getTokenPayload(req);
  if (!requireRoles(res, payload, ["superadmin"])) return true;

  const tenantSelect = `
    SELECT r.*,
      COALESCE(r.owner_email, owner_user.email) AS resolved_owner_email,
      s.id AS subscription_id, s.plan AS subscription_plan, s.status AS subscription_status, s.expiry_date AS subscription_expiry_date,
      payment.provider AS payment_provider, payment.is_active AS payment_is_active
    FROM restaurants r
    LEFT JOIN LATERAL (
      SELECT email FROM users WHERE restaurant_id=r.id AND role='admin' ORDER BY created_at ASC LIMIT 1
    ) owner_user ON TRUE
    LEFT JOIN LATERAL (
      SELECT * FROM subscriptions WHERE restaurant_id=r.id ORDER BY id DESC LIMIT 1
    ) s ON TRUE
    LEFT JOIN LATERAL (
      SELECT provider, is_active FROM payment_configs WHERE restaurant_id=r.id ORDER BY is_active DESC, created_at DESC LIMIT 1
    ) payment ON TRUE
  `;

  const uniqueSlug = async (value, fallback, excludedId = null) => {
    const root = slugify(value || fallback);
    if (!root) return null;
    let slug = root;
    let suffix = 2;
    while (true) {
      const params = [slug];
      let sql = "SELECT id FROM restaurants WHERE LOWER(slug)=LOWER($1)";
      if (excludedId) {
        params.push(excludedId);
        sql += " AND id <> $2";
      }
      if ((await pool.query(sql, params)).rowCount === 0) return slug;
      slug = `${root}-${suffix++}`;
    }
  };

  const getTenant = async (id) => {
    const result = await pool.query(`${tenantSelect} WHERE r.id=$1`, [id]);
    return result.rows[0] ? formatTenant(result.rows[0]) : null;
  };

  const getDashboard = async () => {
    const [tenantRows, userRows, orderRows, monthlyRows, growthRows, typeRows, methodRows] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE LOWER(status)='active')::int AS active FROM restaurants`),
      pool.query(`SELECT COUNT(*)::int AS total FROM users WHERE restaurant_id IS NOT NULL`),
      pool.query(`
        SELECT COUNT(*)::int AS total_orders, COALESCE(SUM(total),0) AS total_revenue,
          COALESCE(SUM(total) FILTER (WHERE LOWER(payment_status) IN ('paid','completed')),0) AS paid_revenue,
          COALESCE(SUM(total) FILTER (WHERE LOWER(payment_status) NOT IN ('paid','completed')),0) AS unpaid_revenue
        FROM orders
      `),
      pool.query(`
        SELECT TO_CHAR(DATE_TRUNC('month',created_at),'YYYY-MM') AS period, TO_CHAR(DATE_TRUNC('month',created_at),'Mon') AS month,
          COALESCE(SUM(total),0) AS revenue, COUNT(*)::int AS orders
        FROM orders WHERE created_at >= DATE_TRUNC('month',CURRENT_DATE)-INTERVAL '11 months'
        GROUP BY DATE_TRUNC('month',created_at) ORDER BY DATE_TRUNC('month',created_at)
      `),
      pool.query(`
        SELECT TO_CHAR(DATE_TRUNC('month',created_at),'YYYY-MM') AS period, TO_CHAR(DATE_TRUNC('month',created_at),'Mon') AS month, COUNT(*)::int AS count
        FROM restaurants WHERE created_at >= DATE_TRUNC('month',CURRENT_DATE)-INTERVAL '11 months'
        GROUP BY DATE_TRUNC('month',created_at) ORDER BY DATE_TRUNC('month',created_at)
      `),
      pool.query(`SELECT order_type AS type, COUNT(*)::int AS count FROM orders GROUP BY order_type ORDER BY count DESC`),
      pool.query(`SELECT COALESCE(payment_method,'unknown') AS method, COALESCE(SUM(total),0) AS amount FROM orders GROUP BY COALESCE(payment_method,'unknown') ORDER BY amount DESC`),
    ]);
    const orders = orderRows.rows[0];
    const totalRevenue = toNumber(orders.total_revenue);
    const totalOrders = toNumber(orders.total_orders);
    return {
      totalTenants: toNumber(tenantRows.rows[0].total),
      activeTenants: toNumber(tenantRows.rows[0].active),
      totalUsers: toNumber(userRows.rows[0].total),
      totalOrders,
      totalRevenue,
      paidRevenue: toNumber(orders.paid_revenue),
      unpaidRevenue: toNumber(orders.unpaid_revenue),
      averageOrderValue: totalOrders ? Number((totalRevenue / totalOrders).toFixed(2)) : 0,
      monthlyRevenue: monthlyRows.rows.map((row) => ({ period: row.period, month: row.month, revenue: toNumber(row.revenue), orders: toNumber(row.orders) })),
      tenantGrowth: growthRows.rows.map((row) => ({ period: row.period, month: row.month, count: toNumber(row.count) })),
      orderTypeBreakdown: typeRows.rows.map((row) => ({ type: externalOrderType(row.type), count: toNumber(row.count) })),
      paymentMethodBreakdown: methodRows.rows.map((row) => ({ method: row.method, amount: toNumber(row.amount) })),
    };
  };

  if (req.method === "GET" && pathName === "/superadmin/dashboard") {
    send(res, 200, await getDashboard());
    return true;
  }

  if (req.method === "GET" && pathName === "/superadmin/analytics") {
    const dashboard = await getDashboard();
    const growth = new Map(dashboard.tenantGrowth.map((item) => [item.period, item.count]));
    send(res, 200, {
      ...dashboard,
      totalRestaurants: dashboard.totalTenants,
      monthlyData: dashboard.monthlyRevenue.map((item) => ({ ...item, restaurants: growth.get(item.period) || 0 })),
    });
    return true;
  }

  if (req.method === "GET" && pathName === "/superadmin/tenants") {
    const params = [];
    const clauses = [];
    const type = url.searchParams.get("type");
    if (type) {
      const normalized = validatedTenantType(type);
      if (!normalized) return send(res, 400, { error: "Invalid tenant type" }), true;
      params.push(normalized);
      clauses.push(`r.tenant_type=$${params.length}`);
    }
    const result = await pool.query(`${tenantSelect} ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY r.created_at DESC`, params);
    send(res, 200, result.rows.map(formatTenant));
    return true;
  }

  const tenantMatch = pathName.match(/^\/superadmin\/tenants\/(\d+)$/);
  if (req.method === "GET" && tenantMatch) {
    const tenant = await getTenant(Number(tenantMatch[1]));
    send(res, tenant ? 200 : 404, tenant || { error: "Tenant not found" });
    return true;
  }

  if (req.method === "POST" && pathName === "/superadmin/tenants") {
    const body = await parseBody(req);
    const name = String(body.name || "").trim();
    const owner = String(body.ownerName || body.owner || "").trim();
    const type = validatedTenantType(body.type || body.tenantType);
    const slug = await uniqueSlug(body.slug, name);
    if (!name || !owner || !type || !slug) return send(res, 400, { error: "Valid name, ownerName and type are required" }), true;
    const result = await pool.query(`
      INSERT INTO restaurants (name, slug, tenant_type, owner, owner_email, city, address, phone, status, plan, logo_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Active',$9,$10) RETURNING *
    `, [name, slug, type, owner, body.ownerEmail || null, body.city || body.address || "", body.address || body.city || "", body.phone || null, body.plan || "Standard", body.logoUrl || null]);
    const created = result.rows[0];
    const startDate = body.subscription?.startDate || new Date().toISOString().slice(0, 10);
    const fallbackExpiry = new Date(`${startDate}T00:00:00Z`);
    fallbackExpiry.setUTCFullYear(fallbackExpiry.getUTCFullYear() + 1);
    await pool.query(`
      INSERT INTO subscriptions (restaurant_id, restaurant_name, owner, plan, status, start_date, expiry_date, grace_period_days)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [created.id, created.name, created.owner, body.subscription?.plan || body.plan || "Standard", "Inactive", startDate, body.subscription?.expiryDate || fallbackExpiry.toISOString().slice(0, 10), toNumber(body.subscription?.gracePeriodDays)]);
    send(res, 201, await getTenant(created.id));
    return true;
  }

  if (req.method === "PUT" && tenantMatch) {
    const body = await parseBody(req);
    const id = Number(tenantMatch[1]);
    const type = body.type || body.tenantType ? validatedTenantType(body.type || body.tenantType) : null;
    if ((body.type || body.tenantType) && !type) return send(res, 400, { error: "Invalid tenant type" }), true;
    const slug = body.slug ? await uniqueSlug(body.slug, body.name, id) : null;
    const result = await pool.query(`
      UPDATE restaurants SET name=COALESCE($1,name), slug=COALESCE($2,slug), tenant_type=COALESCE($3,tenant_type),
        owner=COALESCE($4,owner), owner_email=COALESCE($5,owner_email), city=COALESCE($6,city),
        address=COALESCE($7,address), phone=COALESCE($8,phone), logo_url=COALESCE($9,logo_url), updated_at=NOW()
      WHERE id=$10 RETURNING id
    `, [body.name, slug, type, body.ownerName || body.owner, body.ownerEmail, body.city, body.address, body.phone, body.logoUrl, id]);
    send(res, result.rowCount ? 200 : 404, result.rowCount ? await getTenant(id) : { error: "Tenant not found" });
    return true;
  }

  if (req.method === "DELETE" && tenantMatch) {
    const result = await pool.query("DELETE FROM restaurants WHERE id=$1 RETURNING id", [Number(tenantMatch[1])]);
    send(res, result.rowCount ? 200 : 404, result.rowCount ? { success: true, id: result.rows[0].id } : { error: "Tenant not found" });
    return true;
  }

  const tenantStatusMatch = pathName.match(/^\/superadmin\/tenants\/(\d+)\/status$/);
  if (req.method === "PATCH" && tenantStatusMatch) {
    const body = await parseBody(req);
    const status = String(body.status || "").toLowerCase();
    if (!["active", "paused", "inactive", "suspended"].includes(status)) return send(res, 400, { error: "Invalid tenant status" }), true;
    const id = Number(tenantStatusMatch[1]);
    const result = await pool.query("UPDATE restaurants SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING id", [status === "active" ? "Active" : "Inactive", id]);
    send(res, result.rowCount ? 200 : 404, result.rowCount ? await getTenant(id) : { error: "Tenant not found" });
    return true;
  }

  if (req.method === "GET" && pathName === "/superadmin/users") {
    const result = await pool.query(`
      SELECT u.*, COALESCE(r.name,u.restaurant_name) AS tenant_name, r.tenant_type
      FROM users u LEFT JOIN restaurants r ON r.id=u.restaurant_id ORDER BY u.created_at DESC
    `);
    send(res, 200, result.rows.map((row) => formatUser(row)));
    return true;
  }

  if (req.method === "POST" && pathName === "/superadmin/users") {
    const body = await parseBody(req);
    const role = String(body.role || "staff").toLowerCase();
    const email = String(body.email || "").trim().toLowerCase();
    const restaurantId = role === "superadmin" ? null : idFrom(body.tenantId || body.restaurantId);
    if (!body.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !USER_ROLES.includes(role) || (role !== "superadmin" && !restaurantId)) {
      return send(res, 400, { error: "Valid name, email, role and tenantId are required" }), true;
    }
    const password = String(body.temporaryPassword || body.password || `Temp@${crypto.randomBytes(6).toString("hex")}`);
    const result = await pool.query(`
      INSERT INTO users (name,email,password,role,restaurant_id,restaurant_name,is_active,must_change_password)
      VALUES ($1,$2,$3,$4,$5,(SELECT name FROM restaurants WHERE id=$5),$6,$7) RETURNING *
    `, [String(body.name).trim(), email, await bcrypt.hash(password, 10), role, restaurantId, body.status !== "inactive", role !== "superadmin"]);
    result.rows[0].tenant_name = result.rows[0].restaurant_name;
    send(res, 201, formatUser(result.rows[0], password));
    return true;
  }

  const userMatch = pathName.match(/^\/superadmin\/users\/(\d+)$/);
  if (req.method === "PATCH" && userMatch) {
    const body = await parseBody(req);
    const role = body.role ? String(body.role).toLowerCase() : null;
    if (role && !USER_ROLES.includes(role)) return send(res, 400, { error: "Invalid role" }), true;
    const restaurantId = body.tenantId || body.restaurantId ? idFrom(body.tenantId || body.restaurantId) : null;
    const shouldChangeTenant = body.tenantId !== undefined || body.restaurantId !== undefined || role === "superadmin";
    const isActiveValue = body.status !== undefined ? body.status === "active" : body.isActive;
    const result = await pool.query(`
      UPDATE users SET name=COALESCE($1,name), email=COALESCE($2,email), role=COALESCE($3,role),
        restaurant_id=CASE WHEN $4::boolean THEN $5 ELSE restaurant_id END,
        restaurant_name=CASE WHEN $4::boolean THEN (SELECT name FROM restaurants WHERE id=$5) ELSE restaurant_name END,
        is_active=COALESCE($6,is_active), must_change_password=COALESCE($7,must_change_password), updated_at=NOW()
      WHERE id=$8 RETURNING *
    `, [body.name, body.email?.toLowerCase().trim(), role, shouldChangeTenant, role === "superadmin" ? null : restaurantId, isActiveValue, body.passwordResetRequired, Number(userMatch[1])]);
    if (result.rowCount) result.rows[0].tenant_name = result.rows[0].restaurant_name;
    send(res, result.rowCount ? 200 : 404, result.rowCount ? formatUser(result.rows[0]) : { error: "User not found" });
    return true;
  }

  const userResetMatch = pathName.match(/^\/superadmin\/users\/(\d+)\/reset-password$/);
  if (req.method === "POST" && userResetMatch) {
    const body = await parseBody(req);
    const generated = !(body.temporaryPassword || body.password);
    const password = String(body.temporaryPassword || body.password || `Temp@${crypto.randomBytes(6).toString("hex")}`);
    if (password.length < 8) return send(res, 400, { error: "Password must be at least 8 characters" }), true;
    const result = await pool.query("UPDATE users SET password=$1,must_change_password=TRUE,updated_at=NOW() WHERE id=$2 RETURNING id", [await bcrypt.hash(password, 10), Number(userResetMatch[1])]);
    send(res, result.rowCount ? 200 : 404, result.rowCount ? { success: true, id: result.rows[0].id, passwordResetRequired: true, temporaryPassword: generated ? password : undefined } : { error: "User not found" });
    return true;
  }

  if (req.method === "DELETE" && userMatch) {
    const result = await pool.query("DELETE FROM users WHERE id=$1 AND role <> 'superadmin' RETURNING id", [Number(userMatch[1])]);
    send(res, result.rowCount ? 200 : 404, result.rowCount ? { success: true, id: result.rows[0].id } : { error: "User not found" });
    return true;
  }

  if (req.method === "GET" && pathName === "/superadmin/orders") {
    const result = await pool.query(`
      SELECT o.*,r.name AS tenant_name,r.tenant_type FROM orders o
      JOIN restaurants r ON r.id=o.restaurant_id ORDER BY o.created_at DESC LIMIT 500
    `);
    send(res, 200, result.rows.map((row) => ({
      id: row.id, tenantId: row.restaurant_id, tenantName: row.tenant_name, tenantType: row.tenant_type || "restaurant",
      amount: toNumber(row.total), paymentStatus: externalPaymentStatus(row.payment_status), paymentMethod: row.payment_method || "unknown",
      orderType: externalOrderType(row.order_type), status: row.status, createdAt: toTimestamp(row.created_at),
    })));
    return true;
  }

  if (req.method === "GET" && pathName === "/superadmin/revenue") {
    const [orders, monthly, expenses, methods] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total_orders,COALESCE(SUM(total),0) AS total_revenue,COALESCE(SUM(total) FILTER(WHERE LOWER(payment_status) IN ('paid','completed')),0) AS paid_revenue FROM orders`),
      pool.query(`SELECT TO_CHAR(DATE_TRUNC('month',created_at),'YYYY-MM') AS period,TO_CHAR(DATE_TRUNC('month',created_at),'Mon') AS month,COALESCE(SUM(total),0) AS revenue,COUNT(*)::int AS orders FROM orders GROUP BY DATE_TRUNC('month',created_at) ORDER BY DATE_TRUNC('month',created_at)`),
      pool.query(`SELECT COALESCE(SUM(amount),0) AS total_expenses FROM tenant_expenses`),
      pool.query(`SELECT COALESCE(payment_method,'unknown') AS method,COALESCE(SUM(total),0) AS amount FROM orders GROUP BY COALESCE(payment_method,'unknown') ORDER BY amount DESC`),
    ]);
    const row = orders.rows[0];
    const totalRevenue = toNumber(row.total_revenue);
    const paidRevenue = toNumber(row.paid_revenue);
    const totalExpenses = toNumber(expenses.rows[0].total_expenses);
    const totalOrders = toNumber(row.total_orders);
    send(res, 200, {
      totalRevenue, paidRevenue, unpaidRevenue: totalRevenue - paidRevenue, totalExpenses, totalOrders,
      averageOrderValue: totalOrders ? Number((totalRevenue / totalOrders).toFixed(2)) : 0,
      profitMargin: totalRevenue ? Number((((totalRevenue - totalExpenses) / totalRevenue) * 100).toFixed(2)) : 0,
      monthlyData: monthly.rows.map((item) => ({ period: item.period, month: item.month, revenue: toNumber(item.revenue), orders: toNumber(item.orders), expenses: 0 })),
      paymentMethods: methods.rows.map((item) => ({ method: item.method, amount: toNumber(item.amount) })),
    });
    return true;
  }

  if (req.method === "GET" && pathName === "/superadmin/subscriptions") {
    const result = await pool.query(`
      SELECT s.*,r.name AS tenant_name,r.tenant_type FROM subscriptions s
      JOIN restaurants r ON r.id=s.restaurant_id ORDER BY s.expiry_date ASC NULLS LAST,s.id DESC
    `);
    send(res, 200, result.rows.map(formatSubscription));
    return true;
  }

  const subscriptionMatch = pathName.match(/^\/superadmin\/subscriptions\/(\d+)$/);
  if (req.method === "PATCH" && subscriptionMatch) {
    const body = await parseBody(req);
    let status = body.status ? validatedSubscriptionStatus(body.status) : null;
    if (body.action === "renew" || body.action === "activate") status = "active";
    if (body.action === "suspend") status = "suspended";
    if (body.status && !status) return send(res, 400, { error: "Invalid subscription status" }), true;
    const result = await pool.query(`
      UPDATE subscriptions SET plan=COALESCE($1,plan),status=COALESCE($2,status),start_date=COALESCE($3,start_date),
        expiry_date=COALESCE($4,expiry_date),grace_period_days=COALESCE($5,grace_period_days)
      WHERE id=$6 RETURNING *
    `, [body.plan, status ? storageSubscriptionStatus(status) : null, body.startDate, body.expiryDate || body.expiry || body.expiry_date, body.gracePeriodDays, Number(subscriptionMatch[1])]);
    if (!result.rowCount) return send(res, 404, { error: "Subscription not found" }), true;
    const row = (await pool.query("SELECT s.*,r.name AS tenant_name,r.tenant_type FROM subscriptions s JOIN restaurants r ON r.id=s.restaurant_id WHERE s.id=$1", [result.rows[0].id])).rows[0];
    send(res, 200, formatSubscription(row));
    return true;
  }

  const paymentMatch = pathName.match(/^\/superadmin\/tenants\/(\d+)\/payment-config$/);
  if (req.method === "GET" && paymentMatch) {
    const params = [Number(paymentMatch[1])];
    const provider = url.searchParams.get("provider");
    if (provider) params.push(provider);
    const result = await pool.query(`
      SELECT config.*,r.name AS tenant_name FROM payment_configs config JOIN restaurants r ON r.id=config.restaurant_id
      WHERE config.restaurant_id=$1 ${provider ? "AND config.provider=$2" : ""} ORDER BY config.is_active DESC,config.created_at DESC LIMIT 1
    `, params);
    send(res, 200, formatPayment(result.rows[0]));
    return true;
  }

  if (req.method === "POST" && paymentMatch) {
    const body = await parseBody(req);
    const restaurantId = Number(paymentMatch[1]);
    const provider = String(body.provider || "razorpay").toLowerCase();
    if (!PAYMENT_PROVIDERS.includes(provider)) return send(res, 400, { error: "Invalid payment provider" }), true;
    const current = (await pool.query("SELECT * FROM payment_configs WHERE restaurant_id=$1 AND provider=$2", [restaurantId, provider])).rows[0];
    const keyId = body.keyId || body.key_id || current?.key_id;
    const keySecret = body.keySecret || body.key_secret || current?.key_secret;
    if (!keyId || !keySecret) return send(res, 400, { error: "Key ID and key secret are required" }), true;
    await pool.query(`
      INSERT INTO payment_configs(restaurant_id,provider,key_id,key_secret,webhook_secret,website,is_active)
      VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(restaurant_id,provider) DO UPDATE SET key_id=EXCLUDED.key_id,key_secret=EXCLUDED.key_secret,
        webhook_secret=EXCLUDED.webhook_secret,website=EXCLUDED.website,is_active=EXCLUDED.is_active,updated_at=NOW()
    `, [restaurantId, provider, keyId, keySecret, body.webhookSecret ?? body.webhook_secret ?? current?.webhook_secret ?? null, body.website ?? current?.website ?? null, body.isActive ?? current?.is_active ?? true]);
    const row = (await pool.query("SELECT config.*,r.name AS tenant_name FROM payment_configs config JOIN restaurants r ON r.id=config.restaurant_id WHERE config.restaurant_id=$1 AND config.provider=$2", [restaurantId, provider])).rows[0];
    send(res, current ? 200 : 201, formatPayment(row));
    return true;
  }

  const paymentValidationMatch = pathName.match(/^\/superadmin\/tenants\/(\d+)\/payment-config\/validate$/);
  if (req.method === "POST" && paymentValidationMatch) {
    const body = await parseBody(req);
    const provider = String(body.provider || "razorpay").toLowerCase();
    const current = (await pool.query("SELECT * FROM payment_configs WHERE restaurant_id=$1 AND provider=$2", [Number(paymentValidationMatch[1]), provider])).rows[0];
    const keyId = body.keyId || body.key_id || current?.key_id;
    const keySecret = body.keySecret || body.key_secret || current?.key_secret;
    if (!keyId || !keySecret) return send(res, 400, { error: "Key ID and key secret are required" }), true;
    const valid = provider === "razorpay" ? keyId.startsWith("rzp_") : keyId.length >= 10 && keySecret.length >= 16;
    send(res, 200, { isValid: valid, message: valid ? `${provider} credential format is valid` : `Invalid ${provider} credential format` });
    return true;
  }

  return false;
}
