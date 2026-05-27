import { Router } from 'express';
import { query } from '../db.mjs';
import { authenticate } from '../middleware/auth.mjs';

const router = Router();

// ===== INVENTORY =====
router.get('/inventory', authenticate, async (req, res) => {
  try {
    const { rows } = await query(`SELECT *, quantity as stock FROM inventory WHERE restaurant_id=$1 ORDER BY name`, [req.user.restaurantId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/inventory', authenticate, async (req, res) => {
  try {
    const { name, unit, stock, quantity, min_stock, max_stock, category } = req.body;
    const qty = Number(stock || quantity || 0);
    if (!name) return res.status(400).json({ error: 'Name required' });
    const { rows } = await query(
      `INSERT INTO inventory (restaurant_id, name, unit, quantity, min_stock, max_stock, category)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *, quantity as stock`,
      [req.user.restaurantId, name.trim(), unit || 'kg', qty, Number(min_stock || 0), Number(max_stock || 0), category || 'General']
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/inventory/:id', authenticate, async (req, res) => {
  try {
    const { name, unit, quantity, stock, min_stock, max_stock, category } = req.body;
    const qty = quantity !== undefined ? Number(quantity) : (stock !== undefined ? Number(stock) : null);
    const { rows } = await query(
      `UPDATE inventory SET
        name=COALESCE($1,name), unit=COALESCE($2,unit),
        quantity=COALESCE($3,quantity), min_stock=COALESCE($4,min_stock),
        max_stock=COALESCE($5,max_stock), category=COALESCE($6,category),
        updated_at=NOW()
       WHERE id=$7 AND restaurant_id=$8 RETURNING *, quantity as stock`,
      [name, unit, qty, min_stock ? Number(min_stock) : null, max_stock ? Number(max_stock) : null, category, req.params.id, req.user.restaurantId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/inventory/:id', authenticate, async (req, res) => {
  try {
    await query(`DELETE FROM inventory WHERE id=$1 AND restaurant_id=$2`, [req.params.id, req.user.restaurantId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== PAYROLL =====
router.get('/payroll/staff', authenticate, async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM payroll_staff WHERE restaurant_id=$1 ORDER BY name`, [req.user.restaurantId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/payroll/staff', authenticate, async (req, res) => {
  try {
    const { name, role, present, leaves, salary } = req.body;
    if (!name || !role) return res.status(400).json({ error: 'Name and role required' });
    const { rows } = await query(
      `INSERT INTO payroll_staff (restaurant_id, name, role, present, leaves, salary) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.restaurantId, name.trim(), role.trim(), present !== false, Number(leaves || 0), Number(salary || 0)]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/payroll/staff/:id', authenticate, async (req, res) => {
  try {
    const { name, role, present, leaves, salary } = req.body;
    const { rows } = await query(
      `UPDATE payroll_staff SET name=COALESCE($1,name), role=COALESCE($2,role), present=COALESCE($3,present),
       leaves=COALESCE($4,leaves), salary=COALESCE($5,salary) WHERE id=$6 AND restaurant_id=$7 RETURNING *`,
      [name, role, present !== undefined ? Boolean(present) : null, leaves !== undefined ? Number(leaves) : null, salary !== undefined ? Number(salary) : null, req.params.id, req.user.restaurantId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/payroll/staff/:id', authenticate, async (req, res) => {
  try {
    await query(`DELETE FROM payroll_staff WHERE id=$1 AND restaurant_id=$2`, [req.params.id, req.user.restaurantId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== TASKS =====
router.get('/tasks', authenticate, async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM tasks WHERE restaurant_id=$1 ORDER BY id`, [req.user.restaurantId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/tasks', authenticate, async (req, res) => {
  try {
    const { title, assigned_to, status } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    const { rows } = await query(
      `INSERT INTO tasks (restaurant_id, title, assigned_to, status) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.restaurantId, title.trim(), assigned_to || 'Unassigned', status || 'Pending']
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/tasks/:id', authenticate, async (req, res) => {
  try {
    const { title, assigned_to, status } = req.body;
    const { rows } = await query(
      `UPDATE tasks SET title=COALESCE($1,title), assigned_to=COALESCE($2,assigned_to), status=COALESCE($3,status)
       WHERE id=$4 AND restaurant_id=$5 RETURNING *`,
      [title, assigned_to, status, req.params.id, req.user.restaurantId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/tasks/:id', authenticate, async (req, res) => {
  try {
    await query(`DELETE FROM tasks WHERE id=$1 AND restaurant_id=$2`, [req.params.id, req.user.restaurantId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== CRM =====
router.get('/crm/customers', authenticate, async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM crm_customers WHERE restaurant_id=$1 ORDER BY name`, [req.user.restaurantId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/crm/customers', authenticate, async (req, res) => {
  try {
    const { name, email, phone, visits, totalSpent, vip } = req.body;
    if (!name || !email || !phone) return res.status(400).json({ error: 'Name, email, phone required' });
    const { rows } = await query(
      `INSERT INTO crm_customers (restaurant_id, name, email, phone, visits, total_spent, vip) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.restaurantId, name.trim(), email.trim(), phone.trim(), Number(visits || 1), Number(totalSpent || 0), Boolean(vip)]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/crm/customers/:id', authenticate, async (req, res) => {
  try {
    const { name, email, phone, visits, totalSpent, total_spent, vip } = req.body;
    const spent = totalSpent !== undefined ? Number(totalSpent) : (total_spent !== undefined ? Number(total_spent) : null);
    const { rows } = await query(
      `UPDATE crm_customers SET name=COALESCE($1,name), email=COALESCE($2,email), phone=COALESCE($3,phone),
       visits=COALESCE($4,visits), total_spent=COALESCE($5,total_spent), vip=COALESCE($6,vip)
       WHERE id=$7 AND restaurant_id=$8 RETURNING *`,
      [name, email, phone, visits !== undefined ? Number(visits) : null, spent, vip !== undefined ? Boolean(vip) : null, req.params.id, req.user.restaurantId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/crm/customers/:id', authenticate, async (req, res) => {
  try {
    await query(`DELETE FROM crm_customers WHERE id=$1 AND restaurant_id=$2`, [req.params.id, req.user.restaurantId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== REPORTS =====
router.get('/reports/overview', authenticate, async (req, res) => {
  try {
    const rid = req.user.restaurantId;
    const [ordersRes, customersRes] = await Promise.all([
      query(`SELECT total, items FROM orders WHERE restaurant_id=$1`, [rid]),
      query(`SELECT COUNT(*) as count FROM crm_customers WHERE restaurant_id=$1`, [rid]),
    ]);
    const orders = ordersRes.rows;
    const revenue = orders.reduce((s, o) => s + Number(o.total || 0), 0);
    const itemCounts = {};
    orders.forEach(o => {
      (Array.isArray(o.items) ? o.items : []).forEach(item => {
        const name = String(item).split(' x')[0].trim();
        itemCounts[name] = (itemCounts[name] || 0) + 1;
      });
    });
    const topItems = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, orders]) => ({ name, orders }));
    res.json({ revenue, totalOrders: orders.length, totalCustomers: Number(customersRes.rows[0].count), topItems });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== STAFF MANAGEMENT (restaurant admin manages own staff) =====
router.get('/staff', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, name, email, role, is_active, created_at FROM users WHERE restaurant_id=$1 AND role != 'superadmin' ORDER BY created_at DESC`,
      [req.user.restaurantId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/staff', authenticate, async (req, res) => {
  try {
    const { name, email, role, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });
    if (!['manager', 'staff', 'cashier', 'chef'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const existing = await query(`SELECT id FROM users WHERE LOWER(email)=LOWER($1)`, [email.trim()]);
    if (existing.rows[0]) return res.status(400).json({ error: 'Email already in use' });

    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.default.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role, restaurant_id, restaurant_name, is_active)
       VALUES ($1,$2,$3,$4,$5,(SELECT name FROM restaurants WHERE id=$5),TRUE) RETURNING id, name, email, role, is_active, created_at`,
      [name.trim(), email.trim().toLowerCase(), hash, role, req.user.restaurantId]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/staff/:id', authenticate, async (req, res) => {
  try {
    const { name, role, is_active } = req.body;
    const { rows } = await query(
      `UPDATE users SET
        name=COALESCE($1,name),
        role=COALESCE($2,role),
        is_active=COALESCE($3,is_active)
       WHERE id=$4 AND restaurant_id=$5 AND role != 'admin' RETURNING id, name, email, role, is_active`,
      [name||null, role||null, is_active !== undefined ? Boolean(is_active) : null, req.params.id, req.user.restaurantId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Staff not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/staff/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM users WHERE id=$1 AND restaurant_id=$2 AND role != 'admin'`,
      [req.params.id, req.user.restaurantId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Staff not found or cannot delete admin' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== RESTAURANT SETTINGS =====
router.get('/settings', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT name, owner, city, logo_url, tax_rate, service_charge, default_delivery_partner, table_sections
       FROM restaurants WHERE id=$1`,
      [req.user.restaurantId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Restaurant not found' });
    const r = rows[0];
    res.json({
      name: r.name || '',
      owner: r.owner || '',
      city: r.city || '',
      logo_url: r.logo_url || '',
      tax_rate: Number(r.tax_rate ?? 5),
      service_charge: Number(r.service_charge ?? 0),
      default_delivery_partner: r.default_delivery_partner || 'in-house',
      table_sections: Array.isArray(r.table_sections) ? r.table_sections : [],
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/settings', authenticate, async (req, res) => {
  try {
    const { name, owner, city, logo_url, tax_rate, service_charge, default_delivery_partner, table_sections } = req.body;

    const taxRate = tax_rate !== undefined ? Math.min(Math.max(Number(tax_rate), 0), 100) : null;
    const svcCharge = service_charge !== undefined ? Math.min(Math.max(Number(service_charge), 0), 100) : null;

    if (tax_rate !== undefined && isNaN(taxRate)) return res.status(400).json({ error: 'Invalid tax_rate' });
    if (service_charge !== undefined && isNaN(svcCharge)) return res.status(400).json({ error: 'Invalid service_charge' });

    let finalLogoUrl = logo_url;
    if (logo_url && logo_url.startsWith('data:')) {
      const { uploadBase64Image } = await import('../middleware/upload.mjs');
      finalLogoUrl = await uploadBase64Image(logo_url, 'logdine/logos');
    }

    // Validate and sanitize table_sections
    let sectionsJson = null;
    if (Array.isArray(table_sections)) {
      sectionsJson = JSON.stringify(table_sections.filter(s => typeof s === 'string' && s.trim()));
    }

    await query(
      `UPDATE restaurants SET
        name = COALESCE($1, name),
        owner = COALESCE($2, owner),
        city = COALESCE($3, city),
        logo_url = COALESCE($4, logo_url),
        tax_rate = COALESCE($5, tax_rate),
        service_charge = COALESCE($6, service_charge),
        default_delivery_partner = COALESCE($7, default_delivery_partner),
        table_sections = COALESCE($8::jsonb, table_sections)
       WHERE id=$9`,
      [
        name || null,
        owner || null,
        city !== undefined ? city : null,
        finalLogoUrl || null,
        taxRate,
        svcCharge,
        default_delivery_partner || null,
        sectionsJson,
        req.user.restaurantId,
      ]
    );

    const { rows } = await query(
      `SELECT name, owner, city, logo_url, tax_rate, service_charge, default_delivery_partner, table_sections FROM restaurants WHERE id=$1`,
      [req.user.restaurantId]
    );
    const r = rows[0];
    res.json({
      name: r.name,
      owner: r.owner,
      city: r.city,
      logo_url: r.logo_url,
      tax_rate: Number(r.tax_rate),
      service_charge: Number(r.service_charge),
      default_delivery_partner: r.default_delivery_partner,
      table_sections: Array.isArray(r.table_sections) ? r.table_sections : [],
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== DELIVERY API KEYS (per restaurant, stored in memory for now) =====
const deliveryKeys = {};
router.get('/delivery-api-keys', authenticate, async (req, res) => {
  res.json(deliveryKeys[req.user.restaurantId] || { swiggy: '', zomato: '' });
});
router.put('/delivery-api-keys', authenticate, async (req, res) => {
  deliveryKeys[req.user.restaurantId] = { swiggy: req.body.swiggy || '', zomato: req.body.zomato || '' };
  res.json(deliveryKeys[req.user.restaurantId]);
});

export default router;
