import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.mjs';
import { authenticate, requireSuperAdmin } from '../middleware/auth.mjs';
import { uploadBase64Image } from '../middleware/upload.mjs';

const router = Router();
const sa = [authenticate, requireSuperAdmin];

// ===== SUPERADMIN ANALYTICS =====
router.get('/superadmin/analytics', ...sa, async (req, res) => {
  try {
    // Monthly revenue + orders for last 12 months across all restaurants
    const { rows: monthly } = await query(`
      SELECT
        TO_CHAR(created_at, 'Mon') as month,
        EXTRACT(MONTH FROM created_at) as month_num,
        EXTRACT(YEAR FROM created_at) as year,
        SUM(total) as revenue,
        COUNT(*) as orders
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '12 months'
      GROUP BY TO_CHAR(created_at, 'Mon'), EXTRACT(MONTH FROM created_at), EXTRACT(YEAR FROM created_at)
      ORDER BY year, month_num
    `);

    // Restaurant count per month (cumulative)
    const { rows: restMonthly } = await query(`
      SELECT
        TO_CHAR(created_at, 'Mon') as month,
        EXTRACT(MONTH FROM created_at) as month_num,
        EXTRACT(YEAR FROM created_at) as year,
        COUNT(*) as new_restaurants
      FROM restaurants
      WHERE created_at >= NOW() - INTERVAL '12 months'
      GROUP BY TO_CHAR(created_at, 'Mon'), EXTRACT(MONTH FROM created_at), EXTRACT(YEAR FROM created_at)
      ORDER BY year, month_num
    `);

    // Total restaurants for cumulative count
    const { rows: totalRest } = await query(`SELECT COUNT(*) as total FROM restaurants`);
    const totalRestaurants = Number(totalRest[0].total);

    // Build monthly data merging orders + restaurants
    const monthMap = {};
    monthly.forEach(m => {
      const key = `${m.year}-${String(m.month_num).padStart(2,'0')}`;
      monthMap[key] = { month: m.month, revenue: Number(m.revenue || 0), orders: Number(m.orders || 0), restaurants: 0 };
    });
    restMonthly.forEach(m => {
      const key = `${m.year}-${String(m.month_num).padStart(2,'0')}`;
      if (!monthMap[key]) monthMap[key] = { month: m.month, revenue: 0, orders: 0, restaurants: 0 };
      monthMap[key].restaurants = Number(m.new_restaurants || 0);
    });

    const monthlyData = Object.values(monthMap);

    res.json({ monthlyData, totalRestaurants });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== RESTAURANTS =====
router.get('/superadmin/restaurants', ...sa, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT r.*, r.logo_url as logo,
        (SELECT COUNT(*) FROM users u WHERE u.restaurant_id = r.id AND u.is_active = TRUE) as user_count
      FROM restaurants r ORDER BY r.created_at DESC
    `);
    res.json(rows.map(r => ({ ...r, user_count: Number(r.user_count || 0) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/superadmin/restaurants', ...sa, async (req, res) => {
  try {
    const { name, owner, city, status, plan, logo, subscriptionStartDate, subscriptionExpiryDate } = req.body;
    if (!name || !owner) return res.status(400).json({ error: 'name and owner required' });

    const logoUrl = logo ? await uploadBase64Image(logo, 'logdine/logos') : null;

    const { rows } = await query(
      `INSERT INTO restaurants (name, owner, city, status, plan, logo_url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name.trim(), owner.trim(), city || '', status || 'Active', plan || 'Standard', logoUrl]
    );
    const restaurant = rows[0];

    // Create subscription
    const startDate = subscriptionStartDate || new Date().toISOString().split('T')[0];
    let expiryDate = subscriptionExpiryDate;
    if (!expiryDate) {
      const d = new Date(startDate);
      d.setFullYear(d.getFullYear() + 1);
      expiryDate = d.toISOString().split('T')[0];
    }
    await query(
      `INSERT INTO subscriptions (restaurant_id, restaurant_name, owner, plan, status, start_date, expiry_date, mrr)
       VALUES ($1,$2,$3,$4,'Active',$5,$6,$7)`,
      [restaurant.id, restaurant.name, restaurant.owner, restaurant.plan, startDate, expiryDate, plan === 'Premium' ? '₹5,000' : '₹2,500']
    );

    res.status(201).json({ ...restaurant, logo: restaurant.logo_url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/superadmin/restaurants/:id', ...sa, async (req, res) => {
  try {
    const { name, owner, city, status, plan, logo } = req.body;
    const logoUrl = logo ? await uploadBase64Image(logo, 'logdine/logos') : undefined;
    const { rows } = await query(
      `UPDATE restaurants SET name=COALESCE($1,name), owner=COALESCE($2,owner), city=COALESCE($3,city),
       status=COALESCE($4,status), plan=COALESCE($5,plan), logo_url=COALESCE($6,logo_url)
       WHERE id=$7 RETURNING *`,
      [name, owner, city, status, plan, logoUrl ?? null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/superadmin/restaurants/:id', ...sa, async (req, res) => {
  try {
    await query(`DELETE FROM restaurants WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== USERS =====
router.get('/superadmin/users', ...sa, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT u.id, u.name, u.email, u.role, u.restaurant_id, 
             COALESCE(r.name, u.restaurant_name) as restaurant_name,
             u.is_active, u.must_change_password, u.temp_password as password
      FROM users u
      LEFT JOIN restaurants r ON u.restaurant_id = r.id
      ORDER BY u.created_at DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/superadmin/users', ...sa, async (req, res) => {
  try {
    const { name, email, role, restaurantId, restaurantName, temporaryPassword } = req.body;
    if (!name || !email || !role) return res.status(400).json({ error: 'name, email, role required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });

    const existing = await query(`SELECT id FROM users WHERE LOWER(email)=LOWER($1)`, [email]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'User with this email already exists' });

    const password = temporaryPassword || `Temp@${Date.now()}`;
    const hash = await bcrypt.hash(password, 10);

    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role, restaurant_id, restaurant_name, is_active, temp_password)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7) RETURNING id, name, email, role, restaurant_id, restaurant_name, is_active, temp_password as password`,
      [name.trim(), email.toLowerCase().trim(), hash, role.toLowerCase(), restaurantId || null, restaurantName || null, password]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/superadmin/users/:id', ...sa, async (req, res) => {
  try {
    const { isActive } = req.body;
    const { rows } = await query(
      `UPDATE users SET is_active=$1 WHERE id=$2 RETURNING id, name, email, role, restaurant_id, restaurant_name, is_active`,
      [Boolean(isActive), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/superadmin/users/:id/reset-password', ...sa, async (req, res) => {
  try {
    const { temporaryPassword } = req.body;
    if (!temporaryPassword || temporaryPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const hash = await bcrypt.hash(temporaryPassword, 10);
    // Don't force password change for superadmin
    const userRes = await query(`SELECT role FROM users WHERE id=$1`, [req.params.id]);
    const isSuperadmin = userRes.rows[0]?.role === 'superadmin';
    await query(
      `UPDATE users SET password_hash=$1, must_change_password=$2, temp_password=$3 WHERE id=$4`,
      [hash, !isSuperadmin, temporaryPassword, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/superadmin/users/:id', ...sa, async (req, res) => {
  try {
    const user = await query(`SELECT role FROM users WHERE id=$1`, [req.params.id]);
    if (user.rows[0]?.role === 'superadmin') return res.status(403).json({ error: 'Cannot delete superadmin' });
    await query(`DELETE FROM users WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== SUBSCRIPTIONS =====
router.get('/superadmin/subscriptions', ...sa, async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM subscriptions ORDER BY id`);
    res.json(rows.map(s => ({
      ...s,
      expiry: s.expiry_date,
      name: s.restaurant_name,
      subscription_date: s.start_date,  // frontend expects subscription_date
      created_at: s.start_date,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/superadmin/subscriptions/:id', ...sa, async (req, res) => {
  try {
    const { status, expiry, expiry_date } = req.body;
    const exp = expiry || expiry_date;
    const { rows } = await query(
      `UPDATE subscriptions SET status=COALESCE($1,status), expiry_date=COALESCE($2,expiry_date) WHERE id=$3 RETURNING *`,
      [status, exp, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ ...rows[0], expiry: rows[0].expiry_date });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== SUPPORT =====
router.get('/superadmin/support', ...sa, async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM support_tickets ORDER BY created_at DESC`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/superadmin/support', ...sa, async (req, res) => {
  try {
    const { subject, restaurant, status } = req.body;
    if (!subject) return res.status(400).json({ error: 'Subject required' });
    const { rows } = await query(
      `INSERT INTO support_tickets (subject, restaurant, status) VALUES ($1,$2,$3) RETURNING *`,
      [subject.trim(), restaurant || '', status || 'open']
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/superadmin/support/:id', ...sa, async (req, res) => {
  try {
    const { subject, restaurant, status } = req.body;
    const { rows } = await query(
      `UPDATE support_tickets SET subject=COALESCE($1,subject), restaurant=COALESCE($2,restaurant), status=COALESCE($3,status)
       WHERE id=$4 RETURNING *`,
      [subject, restaurant, status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/superadmin/support/:id', ...sa, async (req, res) => {
  try {
    await query(`DELETE FROM support_tickets WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== SETTINGS =====
router.get('/superadmin/settings', ...sa, async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM system_settings ORDER BY id`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/superadmin/settings/:id', ...sa, async (req, res) => {
  try {
    const { enabled } = req.body;
    const { rows } = await query(
      `UPDATE system_settings SET enabled=$1 WHERE id=$2 RETURNING *`,
      [Boolean(enabled), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
