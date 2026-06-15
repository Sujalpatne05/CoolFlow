import crypto from 'crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.mjs';
import { authenticate, requireSuperAdmin } from '../middleware/auth.mjs';
import { uploadBase64Image } from '../middleware/upload.mjs';

const router = Router();
const sa = [authenticate, requireSuperAdmin];
const TENANT_TYPES = ['cafe', 'restaurant', 'lodging'];
const USER_ROLES = ['superadmin', 'admin', 'manager', 'staff', 'receptionist', 'housekeeping', 'cashier', 'chef'];
const SUBSCRIPTION_STATUSES = ['active', 'grace', 'suspended', 'inactive', 'expired'];
const PAYMENT_PROVIDERS = ['paytm', 'razorpay'];

const activeStatus = (value) => String(value || '').toLowerCase() === 'active';
const number = (value) => Number(value || 0);
const date = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};
const timestamp = (value) => value ? new Date(value).toISOString() : null;
const mask = (value) => value ? '************' : null;
const orderType = (value) => value === 'take-away' ? 'takeaway' : value;
const paymentStatus = (value) => ['paid', 'completed'].includes(String(value).toLowerCase()) ? 'paid' : 'unpaid';
const displayStatus = (value) => {
  const status = String(value || 'inactive').toLowerCase();
  return `${status[0].toUpperCase()}${status.slice(1)}`;
};

const fail = (res, status, error) => res.status(status).json({ error });

const handle = (name, callback) => async (req, res) => {
  try {
    await callback(req, res);
  } catch (error) {
    console.error(`[SUPERADMIN] ${name}:`, error.message);
    if (error.code === '23505') return fail(res, 409, 'A record with the same unique value already exists');
    fail(res, error.status || 500, error.status ? error.message : 'Server error');
  }
};

const httpError = (status, message) => Object.assign(new Error(message), { status });

const tenantId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw httpError(400, 'Invalid tenant id');
  return id;
};

const tenantType = (value = 'restaurant') => {
  const type = String(value).toLowerCase();
  if (!TENANT_TYPES.includes(type)) throw httpError(400, `Invalid tenant type. Use one of: ${TENANT_TYPES.join(', ')}`);
  return type;
};

const subscriptionStatus = (value) => {
  const status = String(value).toLowerCase();
  if (!SUBSCRIPTION_STATUSES.includes(status)) throw httpError(400, `Invalid subscription status. Use one of: ${SUBSCRIPTION_STATUSES.join(', ')}`);
  return status;
};

const slugify = (value) => String(value || '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9\s-]/g, '')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

const uniqueSlug = async (value, fallbackName, excludedId = null) => {
  const root = slugify(value || fallbackName);
  if (!root) throw httpError(400, 'A valid tenant name or slug is required');
  let slug = root;
  let suffix = 2;
  while (true) {
    const params = [slug];
    let sql = `SELECT id FROM restaurants WHERE LOWER(slug) = LOWER($1)`;
    if (excludedId) {
      params.push(excludedId);
      sql += ` AND id <> $2`;
    }
    if (!(await query(sql, params)).rows[0]) return slug;
    slug = `${root}-${suffix++}`;
  }
};

const addTenantFilters = (source, params, clauses, alias = 'r') => {
  if (source.type) {
    params.push(tenantType(source.type));
    clauses.push(`${alias}.tenant_type = $${params.length}`);
  }
  if (source.tenantId) {
    params.push(tenantId(source.tenantId));
    clauses.push(`${alias}.id = $${params.length}`);
  }
};

const addDateFilters = (source, params, clauses, field = 'o.created_at') => {
  if (source.startDate) {
    params.push(source.startDate);
    clauses.push(`${field} >= $${params.length}`);
  }
  if (source.endDate) {
    params.push(source.endDate);
    clauses.push(`${field} < ($${params.length}::date + INTERVAL '1 day')`);
  }
};

const where = (clauses) => clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

const tenantSelect = `
  SELECT
    r.*,
    COALESCE(r.owner_email, owner_user.email) AS resolved_owner_email,
    s.id AS subscription_id,
    s.plan AS subscription_plan,
    s.status AS subscription_status,
    s.expiry_date AS subscription_expiry_date,
    payment.provider AS payment_provider,
    payment.is_active AS payment_is_active
  FROM restaurants r
  LEFT JOIN LATERAL (
    SELECT u.email
    FROM users u
    WHERE u.restaurant_id = r.id AND u.role = 'admin'
    ORDER BY u.created_at ASC
    LIMIT 1
  ) owner_user ON TRUE
  LEFT JOIN LATERAL (
    SELECT sub.*
    FROM subscriptions sub
    WHERE sub.restaurant_id = r.id
    ORDER BY sub.id DESC
    LIMIT 1
  ) s ON TRUE
  LEFT JOIN LATERAL (
    SELECT config.provider, config.is_active
    FROM payment_configs config
    WHERE config.restaurant_id = r.id
    ORDER BY config.is_active DESC, config.created_at DESC
    LIMIT 1
  ) payment ON TRUE
`;

const formatTenant = (row) => ({
  id: row.id,
  name: row.name,
  slug: row.slug || `tenant-${row.id}`,
  type: row.tenant_type || 'restaurant',
  status: activeStatus(row.status) ? 'active' : 'paused',
  logoUrl: row.logo_url || null,
  address: row.address || row.city || null,
  phone: row.phone || null,
  ownerName: row.owner || null,
  ownerEmail: row.resolved_owner_email || null,
  createdAt: timestamp(row.created_at),
  subscription: row.subscription_id ? {
    id: row.subscription_id,
    plan: row.subscription_plan,
    status: String(row.subscription_status || 'inactive').toLowerCase(),
    expiryDate: date(row.subscription_expiry_date)
  } : null,
  payment: {
    provider: row.payment_provider || null,
    isConfigured: Boolean(row.payment_provider),
    isActive: Boolean(row.payment_is_active)
  }
});

const formatUser = (row, temporaryPassword) => ({
  id: row.id,
  tenantId: row.restaurant_id || null,
  tenantName: row.tenant_name || row.restaurant_name || null,
  tenantType: row.tenant_type || null,
  name: row.name,
  email: row.email,
  role: row.role,
  status: row.is_active ? 'active' : 'inactive',
  passwordResetRequired: Boolean(row.must_change_password),
  createdAt: timestamp(row.created_at),
  temporaryPassword,
  restaurant_id: row.restaurant_id || null,
  restaurant_name: row.tenant_name || row.restaurant_name || null,
  is_active: Boolean(row.is_active),
  must_change_password: Boolean(row.must_change_password)
});

const formatOrder = (row) => ({
  id: row.id,
  tenantId: row.restaurant_id,
  tenantName: row.tenant_name,
  tenantType: row.tenant_type || 'restaurant',
  amount: number(row.total),
  paymentStatus: paymentStatus(row.payment_status),
  paymentMethod: row.payment_method || 'unknown',
  orderType: orderType(row.order_type),
  status: row.status,
  createdAt: timestamp(row.created_at)
});

const formatSubscription = (row) => {
  const expiryDate = date(row.expiry_date);
  const overdueDays = expiryDate
    ? Math.max(Math.floor((Date.now() - new Date(`${expiryDate}T00:00:00Z`).getTime()) / 86400000), 0)
    : number(row.overdue_days);
  const graceDays = number(row.grace_period_days);
  const status = String(row.status || 'inactive').toLowerCase();
  let riskStatus = 'low';
  if (['suspended', 'expired'].includes(status) || overdueDays > graceDays) riskStatus = 'high';
  else if (status === 'grace' || overdueDays > 0) riskStatus = 'medium';

  return {
    id: row.id,
    tenantId: row.restaurant_id,
    tenantName: row.tenant_name || row.restaurant_name,
    tenantType: row.tenant_type || 'restaurant',
    ownerName: row.owner || null,
    plan: row.plan,
    status: displayStatus(status),
    normalizedStatus: status,
    startDate: date(row.start_date),
    expiryDate,
    gracePeriodDays: graceDays,
    overdueDays,
    riskStatus,
    restaurant_id: row.restaurant_id,
    restaurant_name: row.tenant_name || row.restaurant_name,
    name: row.tenant_name || row.restaurant_name,
    owner: row.owner,
    expiry: expiryDate,
    expiry_date: expiryDate,
    subscription_date: date(row.start_date),
    created_at: date(row.start_date),
    mrr: row.mrr
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
  createdAt: timestamp(row.created_at)
}) : null;

const findTenant = async (id) => {
  const row = (await query(`${tenantSelect} WHERE r.id = $1`, [tenantId(id)])).rows[0];
  return row ? formatTenant(row) : null;
};

const ensureTenant = async (id) => {
  const parsedId = tenantId(id);
  const row = (await query(`SELECT id, name FROM restaurants WHERE id = $1`, [parsedId])).rows[0];
  if (!row) throw httpError(404, 'Tenant not found');
  return row;
};

const orderAggregate = async (source = {}) => {
  const params = [];
  const clauses = [];
  addTenantFilters(source, params, clauses);
  addDateFilters(source, params, clauses);
  return (await query(`
    SELECT
      COUNT(o.id)::INTEGER AS total_orders,
      COALESCE(SUM(o.total), 0) AS total_revenue,
      COALESCE(SUM(CASE WHEN LOWER(o.payment_status) IN ('paid', 'completed') THEN o.total ELSE 0 END), 0) AS paid_revenue,
      COALESCE(SUM(CASE WHEN LOWER(o.payment_status) NOT IN ('paid', 'completed') THEN o.total ELSE 0 END), 0) AS unpaid_revenue
    FROM orders o
    JOIN restaurants r ON r.id = o.restaurant_id
    ${where(clauses)}
  `, params)).rows[0];
};

const monthlyOrders = async (source = {}) => {
  const params = [];
  const clauses = [`o.created_at >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'`];
  addTenantFilters(source, params, clauses);
  addDateFilters(source, params, clauses);
  const { rows } = await query(`
    SELECT
      TO_CHAR(DATE_TRUNC('month', o.created_at), 'YYYY-MM') AS period,
      TO_CHAR(DATE_TRUNC('month', o.created_at), 'Mon') AS month,
      COALESCE(SUM(o.total), 0) AS revenue,
      COUNT(o.id)::INTEGER AS orders
    FROM orders o
    JOIN restaurants r ON r.id = o.restaurant_id
    ${where(clauses)}
    GROUP BY DATE_TRUNC('month', o.created_at)
    ORDER BY DATE_TRUNC('month', o.created_at)
  `, params);
  return rows.map(row => ({ period: row.period, month: row.month, revenue: number(row.revenue), orders: number(row.orders) }));
};

const paymentMethods = async (source = {}) => {
  const params = [];
  const clauses = [];
  addTenantFilters(source, params, clauses);
  addDateFilters(source, params, clauses);
  const { rows } = await query(`
    SELECT COALESCE(o.payment_method, 'unknown') AS method, COALESCE(SUM(o.total), 0) AS amount
    FROM orders o
    JOIN restaurants r ON r.id = o.restaurant_id
    ${where(clauses)}
    GROUP BY COALESCE(o.payment_method, 'unknown')
    ORDER BY amount DESC
  `, params);
  return rows.map(row => ({ method: row.method, amount: number(row.amount) }));
};

const monthlyExpenses = async (source = {}) => {
  const params = [];
  const clauses = [`e.incurred_on >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'`];
  addTenantFilters(source, params, clauses);
  addDateFilters(source, params, clauses, 'e.incurred_on');
  const { rows } = await query(`
    SELECT
      TO_CHAR(DATE_TRUNC('month', e.incurred_on), 'YYYY-MM') AS period,
      TO_CHAR(DATE_TRUNC('month', e.incurred_on), 'Mon') AS month,
      COALESCE(SUM(e.amount), 0) AS expenses
    FROM tenant_expenses e
    JOIN restaurants r ON r.id = e.restaurant_id
    ${where(clauses)}
    GROUP BY DATE_TRUNC('month', e.incurred_on)
    ORDER BY DATE_TRUNC('month', e.incurred_on)
  `, params);
  return rows.map(row => ({ period: row.period, month: row.month, expenses: number(row.expenses) }));
};

const dashboard = async (source = {}) => {
  const tenantParams = [];
  const tenantClauses = [];
  addTenantFilters(source, tenantParams, tenantClauses);
  const tenantWhere = where(tenantClauses);
  const [
    tenantMetrics,
    userMetrics,
    orders,
    monthlyRevenue,
    growth,
    types,
    methods
  ] = await Promise.all([
    query(`
      SELECT
        COUNT(r.id)::INTEGER AS total_tenants,
        COUNT(CASE WHEN LOWER(r.status) = 'active' THEN 1 END)::INTEGER AS active_tenants
      FROM restaurants r ${tenantWhere}
    `, tenantParams),
    query(`
      SELECT COUNT(u.id)::INTEGER AS total_users
      FROM users u
      JOIN restaurants r ON r.id = u.restaurant_id
      ${tenantWhere}
    `, tenantParams),
    orderAggregate(source),
    monthlyOrders(source),
    query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', r.created_at), 'YYYY-MM') AS period,
        TO_CHAR(DATE_TRUNC('month', r.created_at), 'Mon') AS month,
        COUNT(r.id)::INTEGER AS count
      FROM restaurants r
      ${tenantWhere ? `${tenantWhere} AND` : 'WHERE'} r.created_at >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'
      GROUP BY DATE_TRUNC('month', r.created_at)
      ORDER BY DATE_TRUNC('month', r.created_at)
    `, tenantParams),
    (() => {
      const params = [];
      const clauses = [];
      addTenantFilters(source, params, clauses);
      addDateFilters(source, params, clauses);
      return query(`
        SELECT o.order_type, COUNT(o.id)::INTEGER AS count
        FROM orders o
        JOIN restaurants r ON r.id = o.restaurant_id
        ${where(clauses)}
        GROUP BY o.order_type
        ORDER BY count DESC
      `, params);
    })(),
    paymentMethods(source)
  ]);

  const totalRevenue = number(orders.total_revenue);
  const totalOrders = number(orders.total_orders);
  return {
    totalTenants: number(tenantMetrics.rows[0].total_tenants),
    activeTenants: number(tenantMetrics.rows[0].active_tenants),
    totalUsers: number(userMetrics.rows[0].total_users),
    totalOrders,
    totalRevenue,
    paidRevenue: number(orders.paid_revenue),
    unpaidRevenue: number(orders.unpaid_revenue),
    averageOrderValue: totalOrders ? Number((totalRevenue / totalOrders).toFixed(2)) : 0,
    monthlyRevenue,
    tenantGrowth: growth.rows.map(row => ({ period: row.period, month: row.month, count: number(row.count) })),
    orderTypeBreakdown: types.rows.map(row => ({ type: orderType(row.order_type), count: number(row.count) })),
    paymentMethodBreakdown: methods
  };
};

router.get('/superadmin/dashboard', ...sa, handle('get dashboard', async (req, res) => {
  res.json(await dashboard(req.query));
}));

router.get('/superadmin/analytics', ...sa, handle('get analytics', async (req, res) => {
  const data = await dashboard(req.query);
  const growth = new Map(data.tenantGrowth.map(item => [item.period, item.count]));
  res.json({
    ...data,
    totalRestaurants: data.totalTenants,
    monthlyData: data.monthlyRevenue.map(item => ({ ...item, restaurants: growth.get(item.period) || 0 }))
  });
}));

router.get('/superadmin/tenants', ...sa, handle('get tenants', async (req, res) => {
  const params = [];
  const clauses = [];
  addTenantFilters(req.query, params, clauses);
  if (req.query.status) {
    const status = String(req.query.status).toLowerCase();
    if (!['active', 'paused', 'inactive', 'suspended'].includes(status)) throw httpError(400, 'Invalid tenant status');
    params.push(status === 'active' ? 'active' : 'inactive');
    clauses.push(`LOWER(r.status) = $${params.length}`);
  }
  const { rows } = await query(`${tenantSelect} ${where(clauses)} ORDER BY r.created_at DESC`, params);
  res.json(rows.map(formatTenant));
}));

router.get('/superadmin/tenants/:id', ...sa, handle('get tenant', async (req, res) => {
  const tenant = await findTenant(req.params.id);
  if (!tenant) return fail(res, 404, 'Tenant not found');
  res.json(tenant);
}));

router.post('/superadmin/tenants', ...sa, handle('create tenant', async (req, res) => {
  const type = tenantType(req.body.type || req.body.tenantType);
  const {
    name,
    address,
    city,
    phone,
    ownerName = req.body.owner,
    ownerEmail,
    logo,
    logoUrl,
    plan = 'Standard'
  } = req.body;
  if (!name || !ownerName) throw httpError(400, 'name and ownerName are required');
  if (ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) throw httpError(400, 'Invalid owner email');
  const slug = await uniqueSlug(req.body.slug, name);
  const uploadedLogo = logo ? await uploadBase64Image(logo, 'logdine/logos') : logoUrl || null;
  const { rows } = await query(`
    INSERT INTO restaurants (name, slug, tenant_type, owner, owner_email, city, address, phone, status, plan, logo_url)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Active',$9,$10)
    RETURNING *
  `, [name.trim(), slug, type, ownerName.trim(), ownerEmail || null, city || address || '', address || city || '', phone || null, plan, uploadedLogo]);
  const created = rows[0];
  const startDate = req.body.subscription?.startDate || req.body.subscriptionStartDate || new Date().toISOString().slice(0, 10);
  const expiryDate = req.body.subscription?.expiryDate || req.body.subscriptionExpiryDate || null;
  await query(`
    INSERT INTO subscriptions (restaurant_id, restaurant_name, owner, plan, status, start_date, expiry_date, grace_period_days, mrr)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
  `, [
    created.id,
    created.name,
    created.owner,
    req.body.subscription?.plan || plan,
    subscriptionStatus(req.body.subscription?.status || 'inactive'),
    startDate,
    expiryDate,
    number(req.body.subscription?.gracePeriodDays),
    req.body.subscription?.mrr || null
  ]);
  res.status(201).json(await findTenant(created.id));
}));

router.put('/superadmin/tenants/:id', ...sa, handle('update tenant', async (req, res) => {
  const id = tenantId(req.params.id);
  await ensureTenant(id);
  const uploadedLogo = req.body.logo ? await uploadBase64Image(req.body.logo, 'logdine/logos') : req.body.logoUrl;
  const slug = req.body.slug ? await uniqueSlug(req.body.slug, req.body.name, id) : null;
  const type = req.body.type || req.body.tenantType ? tenantType(req.body.type || req.body.tenantType) : null;
  await query(`
    UPDATE restaurants SET
      name=COALESCE($1,name), slug=COALESCE($2,slug), tenant_type=COALESCE($3,tenant_type),
      owner=COALESCE($4,owner), owner_email=COALESCE($5,owner_email),
      city=COALESCE($6,city), address=COALESCE($7,address), phone=COALESCE($8,phone),
      plan=COALESCE($9,plan), logo_url=COALESCE($10,logo_url), updated_at=NOW()
    WHERE id=$11
  `, [
    req.body.name, slug, type, req.body.ownerName || req.body.owner, req.body.ownerEmail,
    req.body.city, req.body.address, req.body.phone, req.body.subscription?.plan || req.body.plan, uploadedLogo, id
  ]);
  await query(`
    UPDATE subscriptions SET
      restaurant_name=COALESCE($1,restaurant_name), owner=COALESCE($2,owner),
      plan=COALESCE($3,plan), status=COALESCE($4,status)
    WHERE restaurant_id=$5
  `, [
    req.body.name,
    req.body.ownerName || req.body.owner,
    req.body.subscription?.plan || req.body.plan,
    req.body.subscription?.status ? subscriptionStatus(req.body.subscription.status) : null,
    id
  ]);
  res.json(await findTenant(id));
}));

router.delete('/superadmin/tenants/:id', ...sa, handle('delete tenant', async (req, res) => {
  const result = await query(`DELETE FROM restaurants WHERE id=$1`, [tenantId(req.params.id)]);
  if (!result.rowCount) return fail(res, 404, 'Tenant not found');
  res.json({ success: true, id: tenantId(req.params.id) });
}));

router.patch('/superadmin/tenants/:id/status', ...sa, handle('update tenant status', async (req, res) => {
  const status = String(req.body.status || '').toLowerCase();
  if (!['active', 'paused', 'inactive', 'suspended'].includes(status)) throw httpError(400, 'Invalid tenant status');
  const id = tenantId(req.params.id);
  const result = await query(`UPDATE restaurants SET status=$1, updated_at=NOW() WHERE id=$2`, [status === 'active' ? 'Active' : 'Inactive', id]);
  if (!result.rowCount) return fail(res, 404, 'Tenant not found');
  res.json(await findTenant(id));
}));

router.get('/superadmin/users', ...sa, handle('get users', async (req, res) => {
  const params = [];
  const clauses = [];
  if (req.query.type) {
    params.push(tenantType(req.query.type));
    clauses.push(`r.tenant_type = $${params.length}`);
  }
  if (req.query.tenantId) {
    params.push(tenantId(req.query.tenantId));
    clauses.push(`u.restaurant_id = $${params.length}`);
  }
  if (req.query.role) {
    params.push(String(req.query.role).toLowerCase());
    clauses.push(`u.role = $${params.length}`);
  }
  if (req.query.status) {
    params.push(String(req.query.status).toLowerCase() === 'active');
    clauses.push(`u.is_active = $${params.length}`);
  }
  const { rows } = await query(`
    SELECT u.*, COALESCE(r.name, u.restaurant_name) AS tenant_name, r.tenant_type
    FROM users u
    LEFT JOIN restaurants r ON r.id = u.restaurant_id
    ${where(clauses)}
    ORDER BY u.created_at DESC
  `, params);
  res.json(rows.map(row => formatUser(row)));
}));

router.post('/superadmin/users', ...sa, handle('create user', async (req, res) => {
  const {
    name,
    email,
    role = 'staff',
    tenantId: requestedTenantId = req.body.restaurantId,
    temporaryPassword = req.body.password
  } = req.body;
  const normalizedRole = String(role).toLowerCase();
  if (!name || !email) throw httpError(400, 'name and email are required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'Invalid email');
  if (!USER_ROLES.includes(normalizedRole)) throw httpError(400, `Invalid role. Use one of: ${USER_ROLES.join(', ')}`);
  const id = normalizedRole === 'superadmin' ? null : tenantId(requestedTenantId);
  if (id) await ensureTenant(id);
  if ((await query(`SELECT id FROM users WHERE LOWER(email)=LOWER($1)`, [email])).rows[0]) throw httpError(409, 'User with this email already exists');
  const password = temporaryPassword || `Temp@${crypto.randomBytes(6).toString('hex')}`;
  const { rows } = await query(`
    INSERT INTO users (name, email, password_hash, role, restaurant_id, restaurant_name, is_active, must_change_password, temp_password)
    VALUES ($1,$2,$3,$4,$5,(SELECT name FROM restaurants WHERE id=$5),$6,$7,$8)
    RETURNING *
  `, [
    name.trim(), email.toLowerCase().trim(), await bcrypt.hash(password, 10), normalizedRole, id,
    req.body.status !== 'inactive', normalizedRole !== 'superadmin', password
  ]);
  const row = rows[0];
  row.tenant_name = row.restaurant_name;
  res.status(201).json(formatUser(row, password));
}));

router.patch('/superadmin/users/:id', ...sa, handle('update user', async (req, res) => {
  const id = tenantId(req.params.id);
  const current = (await query(`SELECT * FROM users WHERE id=$1`, [id])).rows[0];
  if (!current) return fail(res, 404, 'User not found');
  const role = req.body.role ? String(req.body.role).toLowerCase() : null;
  if (role && !USER_ROLES.includes(role)) throw httpError(400, 'Invalid role');
  if (req.body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email)) throw httpError(400, 'Invalid email');
  const requestedTenantId = req.body.tenantId ?? req.body.restaurantId;
  const restaurantId = requestedTenantId === undefined ? null : (requestedTenantId ? tenantId(requestedTenantId) : null);
  if (restaurantId) await ensureTenant(restaurantId);
  const shouldChangeTenant = requestedTenantId !== undefined || role === 'superadmin';
  const status = req.body.status !== undefined ? req.body.status === 'active' : req.body.isActive;
  const { rows } = await query(`
    UPDATE users SET
      name=COALESCE($1,name), email=COALESCE($2,email), role=COALESCE($3,role),
      restaurant_id=CASE WHEN $4::BOOLEAN THEN $5 ELSE restaurant_id END,
      restaurant_name=CASE WHEN $4::BOOLEAN THEN (SELECT name FROM restaurants WHERE id=$5) ELSE restaurant_name END,
      is_active=COALESCE($6,is_active), must_change_password=COALESCE($7,must_change_password)
    WHERE id=$8
    RETURNING *
  `, [
    req.body.name, req.body.email?.toLowerCase().trim(), role, shouldChangeTenant,
    role === 'superadmin' ? null : restaurantId, status, req.body.passwordResetRequired, id
  ]);
  rows[0].tenant_name = rows[0].restaurant_name;
  res.json(formatUser(rows[0]));
}));

router.post('/superadmin/users/:id/reset-password', ...sa, handle('reset password', async (req, res) => {
  const id = tenantId(req.params.id);
  const current = (await query(`SELECT role FROM users WHERE id=$1`, [id])).rows[0];
  if (!current) return fail(res, 404, 'User not found');
  const generated = !(req.body.temporaryPassword || req.body.password);
  const password = req.body.temporaryPassword || req.body.password || `Temp@${crypto.randomBytes(6).toString('hex')}`;
  if (password.length < 8) throw httpError(400, 'Password must be at least 8 characters');
  await query(`
    UPDATE users SET password_hash=$1, must_change_password=$2, temp_password=$3 WHERE id=$4
  `, [await bcrypt.hash(password, 10), current.role !== 'superadmin', password, id]);
  res.json({ success: true, id, passwordResetRequired: current.role !== 'superadmin', temporaryPassword: generated ? password : undefined });
}));

router.delete('/superadmin/users/:id', ...sa, handle('delete user', async (req, res) => {
  const id = tenantId(req.params.id);
  const current = (await query(`SELECT role FROM users WHERE id=$1`, [id])).rows[0];
  if (!current) return fail(res, 404, 'User not found');
  if (current.role === 'superadmin') return fail(res, 403, 'Cannot delete superadmin');
  await query(`DELETE FROM users WHERE id=$1`, [id]);
  res.json({ success: true, id });
}));

router.get('/superadmin/orders', ...sa, handle('get orders', async (req, res) => {
  const params = [];
  const clauses = [];
  addTenantFilters(req.query, params, clauses);
  addDateFilters(req.query, params, clauses);
  if (req.query.paymentStatus) {
    const status = String(req.query.paymentStatus).toLowerCase();
    clauses.push(status === 'paid'
      ? `LOWER(o.payment_status) IN ('paid', 'completed')`
      : `LOWER(o.payment_status) NOT IN ('paid', 'completed')`);
  }
  if (req.query.orderType) {
    params.push(req.query.orderType === 'takeaway' ? 'take-away' : req.query.orderType);
    clauses.push(`o.order_type = $${params.length}`);
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  params.push(limit);
  const { rows } = await query(`
    SELECT o.*, r.name AS tenant_name, r.tenant_type
    FROM orders o
    JOIN restaurants r ON r.id = o.restaurant_id
    ${where(clauses)}
    ORDER BY o.created_at DESC
    LIMIT $${params.length}
  `, params);
  res.json(rows.map(formatOrder));
}));

router.get('/superadmin/revenue', ...sa, handle('get revenue', async (req, res) => {
  const expenseParams = [];
  const expenseClauses = [];
  addTenantFilters(req.query, expenseParams, expenseClauses);
  addDateFilters(req.query, expenseParams, expenseClauses, 'e.incurred_on');
  const [orders, monthly, monthlyExpenseRows, methods, expenses] = await Promise.all([
    orderAggregate(req.query),
    monthlyOrders(req.query),
    monthlyExpenses(req.query),
    paymentMethods(req.query),
    query(`
      SELECT COALESCE(SUM(e.amount), 0) AS total_expenses
      FROM tenant_expenses e
      JOIN restaurants r ON r.id = e.restaurant_id
      ${where(expenseClauses)}
    `, expenseParams)
  ]);
  const totalRevenue = number(orders.total_revenue);
  const totalExpenses = number(expenses.rows[0].total_expenses);
  const totalOrders = number(orders.total_orders);
  const revenueByMonth = new Map(monthly.map(item => [item.period, item]));
  const expenseByMonth = new Map(monthlyExpenseRows.map(item => [item.period, item]));
  const monthlyData = [...new Set([...revenueByMonth.keys(), ...expenseByMonth.keys()])]
    .sort()
    .map(period => ({
      period,
      month: revenueByMonth.get(period)?.month || expenseByMonth.get(period)?.month,
      revenue: revenueByMonth.get(period)?.revenue || 0,
      orders: revenueByMonth.get(period)?.orders || 0,
      expenses: expenseByMonth.get(period)?.expenses || 0
    }));
  res.json({
    totalRevenue,
    paidRevenue: number(orders.paid_revenue),
    unpaidRevenue: number(orders.unpaid_revenue),
    totalExpenses,
    totalOrders,
    averageOrderValue: totalOrders ? Number((totalRevenue / totalOrders).toFixed(2)) : 0,
    profitMargin: totalRevenue ? Number((((totalRevenue - totalExpenses) / totalRevenue) * 100).toFixed(2)) : 0,
    monthlyData,
    paymentMethods: methods,
    revenueGrowthTrend: monthlyData.map(({ period, month, revenue }) => ({ period, month, revenue }))
  });
}));

router.get('/superadmin/subscriptions', ...sa, handle('get subscriptions', async (req, res) => {
  const params = [];
  const clauses = [];
  addTenantFilters(req.query, params, clauses);
  if (req.query.status) {
    params.push(subscriptionStatus(req.query.status));
    clauses.push(`LOWER(s.status) = $${params.length}`);
  }
  const { rows } = await query(`
    SELECT s.*, r.name AS tenant_name, r.tenant_type
    FROM subscriptions s
    JOIN restaurants r ON r.id = s.restaurant_id
    ${where(clauses)}
    ORDER BY s.expiry_date ASC NULLS LAST, s.id DESC
  `, params);
  res.json(rows.map(formatSubscription));
}));

router.patch('/superadmin/subscriptions/:id', ...sa, handle('update subscription', async (req, res) => {
  const id = tenantId(req.params.id);
  const current = (await query(`SELECT id FROM subscriptions WHERE id=$1`, [id])).rows[0];
  if (!current) return fail(res, 404, 'Subscription not found');
  let status = req.body.status ? subscriptionStatus(req.body.status) : null;
  if (req.body.action === 'renew' || req.body.action === 'activate') status = 'active';
  if (req.body.action === 'suspend') status = 'suspended';
  const { rows } = await query(`
    UPDATE subscriptions SET
      plan=COALESCE($1,plan), status=COALESCE($2,status),
      start_date=COALESCE($3,start_date), expiry_date=COALESCE($4,expiry_date),
      grace_period_days=COALESCE($5,grace_period_days)
    WHERE id=$6 RETURNING *
  `, [
    req.body.plan, status, req.body.startDate, req.body.expiryDate || req.body.expiry || req.body.expiry_date,
    req.body.gracePeriodDays, id
  ]);
  const row = (await query(`
    SELECT s.*, r.name AS tenant_name, r.tenant_type
    FROM subscriptions s JOIN restaurants r ON r.id=s.restaurant_id WHERE s.id=$1
  `, [rows[0].id])).rows[0];
  res.json(formatSubscription(row));
}));

router.get('/superadmin/tenants/:tenantId/payment-config', ...sa, handle('get payment config', async (req, res) => {
  const id = tenantId(req.params.tenantId);
  await ensureTenant(id);
  const params = [id];
  let providerFilter = '';
  if (req.query.provider) {
    const provider = String(req.query.provider).toLowerCase();
    if (!PAYMENT_PROVIDERS.includes(provider)) throw httpError(400, 'Invalid payment provider');
    params.push(provider);
    providerFilter = `AND config.provider = $2`;
  }
  const row = (await query(`
    SELECT config.*, r.name AS tenant_name
    FROM payment_configs config
    JOIN restaurants r ON r.id=config.restaurant_id
    WHERE config.restaurant_id=$1 ${providerFilter}
    ORDER BY config.is_active DESC, config.created_at DESC LIMIT 1
  `, params)).rows[0];
  res.json(formatPayment(row));
}));

router.post('/superadmin/tenants/:tenantId/payment-config', ...sa, handle('save payment config', async (req, res) => {
  const id = tenantId(req.params.tenantId);
  await ensureTenant(id);
  const provider = String(req.body.provider || 'razorpay').toLowerCase();
  if (!PAYMENT_PROVIDERS.includes(provider)) throw httpError(400, 'Invalid payment provider');
  const current = (await query(`SELECT * FROM payment_configs WHERE restaurant_id=$1 AND provider=$2`, [id, provider])).rows[0];
  const keyId = req.body.keyId || req.body.key_id || current?.key_id;
  const keySecret = req.body.keySecret || req.body.key_secret || current?.key_secret;
  const webhookSecret = req.body.webhookSecret ?? req.body.webhook_secret ?? current?.webhook_secret ?? null;
  if (!keyId || !keySecret) throw httpError(400, 'Key ID and key secret are required');
  await query(`
    INSERT INTO payment_configs (restaurant_id, provider, key_id, key_secret, webhook_secret, website, is_active)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (restaurant_id, provider) DO UPDATE SET
      key_id=EXCLUDED.key_id, key_secret=EXCLUDED.key_secret, webhook_secret=EXCLUDED.webhook_secret,
      website=EXCLUDED.website, is_active=EXCLUDED.is_active, updated_at=NOW()
  `, [id, provider, keyId, keySecret, webhookSecret, req.body.website ?? current?.website ?? null, req.body.isActive ?? current?.is_active ?? true]);
  const row = (await query(`
    SELECT config.*, r.name AS tenant_name
    FROM payment_configs config JOIN restaurants r ON r.id=config.restaurant_id
    WHERE config.restaurant_id=$1 AND config.provider=$2
  `, [id, provider])).rows[0];
  res.status(current ? 200 : 201).json(formatPayment(row));
}));

router.post('/superadmin/tenants/:tenantId/payment-config/validate', ...sa, handle('validate payment config', async (req, res) => {
  const id = tenantId(req.params.tenantId);
  await ensureTenant(id);
  const provider = String(req.body.provider || 'razorpay').toLowerCase();
  if (!PAYMENT_PROVIDERS.includes(provider)) throw httpError(400, 'Invalid payment provider');
  const current = (await query(`SELECT * FROM payment_configs WHERE restaurant_id=$1 AND provider=$2`, [id, provider])).rows[0];
  const keyId = req.body.keyId || req.body.key_id || current?.key_id;
  const keySecret = req.body.keySecret || req.body.key_secret || current?.key_secret;
  if (!keyId || !keySecret) throw httpError(400, 'Key ID and key secret are required');
  const valid = provider === 'razorpay'
    ? keyId.startsWith('rzp_')
    : keyId.length >= 10 && keySecret.length >= 16;
  res.json({ isValid: valid, message: valid ? `${provider} credential format is valid` : `Invalid ${provider} credential format` });
}));

export default router;
