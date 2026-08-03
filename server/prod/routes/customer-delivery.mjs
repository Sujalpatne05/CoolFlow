import { Router } from 'express';
import { query } from '../db.mjs';
import { authenticate } from '../middleware/auth.mjs';
import crypto from 'crypto';

const router = Router();

// ==================== ADMIN ROUTES ====================

// Generate delivery link token
router.post('/delivery/public/generate', authenticate, async (req, res) => {
  try {
    const token = crypto.randomBytes(16).toString('hex');
    const { rows } = await query(
      `INSERT INTO delivery_tokens (restaurant_id, token, created_at)
       VALUES ($1, $2, NOW()) RETURNING token`,
      [req.user.restaurantId, token]
    );
    res.json({ token: rows[0].token });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// Get all delivery tokens for a restaurant
router.get('/delivery/tokens', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM delivery_tokens WHERE restaurant_id = $1 ORDER BY created_at DESC`,
      [req.user.restaurantId]
    );
    res.json(rows);
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// Delete delivery token
router.delete('/delivery/tokens/:token', authenticate, async (req, res) => {
  try {
    await query(
      `DELETE FROM delivery_tokens WHERE token = $1 AND restaurant_id = $2`,
      [req.params.token, req.user.restaurantId]
    );
    res.json({ success: true });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// Get all customer delivery orders
router.get('/delivery/orders', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM customer_delivery_orders WHERE restaurant_id = $1 ORDER BY created_at DESC`,
      [req.user.restaurantId]
    );
    res.json(rows);
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// Update delivery order status
router.patch('/delivery/orders/:id/status', authenticate, async (req, res) => {
  try {
    const { delivery_status } = req.body;
    const { rows } = await query(
      `UPDATE customer_delivery_orders 
       SET delivery_status = $1, updated_at = NOW()
       WHERE id = $2 AND restaurant_id = $3 
       RETURNING *`,
      [delivery_status, req.params.id, req.user.restaurantId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Order not found' });
    res.json(rows[0]);
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// ==================== PUBLIC CUSTOMER ROUTES ====================

// Get restaurant info and menu - public endpoint without token
router.get('/public/restaurant-menu', async (req, res) => {
  try {
    // Get the first active restaurant (you can modify this logic)
    const { rows: restaurantRows } = await query(
      `SELECT id, name, logo_url, tax_rate, city 
       FROM restaurants 
       WHERE status = 'Active' 
       ORDER BY id 
       LIMIT 1`
    );
    
    if (!restaurantRows[0]) {
      return res.status(404).json({ error: 'No restaurant found' });
    }

    const restaurantId = restaurantRows[0].id;
    
    // Get menu items
    const { rows: menuRows } = await query(
      `SELECT id, name, category, price, description, image_url, available 
       FROM menu_items 
       WHERE restaurant_id = $1 AND available = TRUE 
       ORDER BY category, name`,
      [restaurantId]
    );

    res.json({
      restaurant: {
        id: restaurantRows[0].id,
        name: restaurantRows[0].name,
        logo: restaurantRows[0].logo_url,
        taxRate: restaurantRows[0].tax_rate || 5,
        city: restaurantRows[0].city
      },
      menu: menuRows
    });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// Create customer delivery order - public endpoint without token
router.post('/public/place-order', async (req, res) => {
  try {
    const { 
      customer_name, 
      customer_phone, 
      customer_email,
      delivery_address,
      landmark,
      pincode,
      items,
      subtotal,
      delivery_fee,
      tax,
      total,
      payment_method,
      payment_status,
      special_instructions
    } = req.body;

    // Validate required fields
    if (!customer_name || !customer_phone || !delivery_address || !items || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get the first active restaurant
    const { rows: restaurantRows } = await query(
      `SELECT id FROM restaurants WHERE status = 'Active' ORDER BY id LIMIT 1`
    );
    
    if (!restaurantRows[0]) {
      return res.status(404).json({ error: 'Restaurant not available' });
    }

    const restaurantId = restaurantRows[0].id;
    
    // Generate order number
    const orderNumber = `DEL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // Calculate estimated delivery time (45 mins from now)
    const estimatedTime = new Date(Date.now() + 45 * 60 * 1000).toLocaleTimeString('en-IN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    // Insert delivery order
    const { rows } = await query(
      `INSERT INTO customer_delivery_orders (
        restaurant_id, order_number, customer_name, customer_phone, customer_email,
        delivery_address, landmark, pincode, items, subtotal, delivery_fee, tax, total,
        payment_method, payment_status, delivery_status, special_instructions, 
        estimated_delivery_time, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
      RETURNING *`,
      [
        restaurantId, orderNumber, customer_name.trim(), customer_phone.trim(), 
        customer_email || '', delivery_address.trim(), landmark || '', pincode || '',
        JSON.stringify(items), subtotal, delivery_fee, tax, total,
        payment_method || 'cod', payment_status || 'pending', 'pending', special_instructions || '',
        estimatedTime
      ]
    );

    // Format items for KDS display - convert to proper format
    const formattedItems = items.map(item => `${item.name} x${item.quantity}`);

    // Also create entry in orders table for KDS
    await query(
      `INSERT INTO orders (
        restaurant_id, order_number, items, total, status, order_type, 
        payment_status, payment_method, notes, created_at
      ) VALUES ($1, $2, $3, $4, 'pending', 'delivery', $5, $6, $7, NOW())`,
      [
        restaurantId, orderNumber, JSON.stringify(formattedItems), total, payment_status || 'pending', 
        payment_method || 'cod',
        `🚚 DELIVERY ORDER

📦 Customer: ${customer_name}
📞 Phone: ${customer_phone}

📍 Address:
${delivery_address}
${landmark ? '🏷️ Landmark: ' + landmark : ''}
${pincode ? '📮 Pincode: ' + pincode : ''}

${special_instructions ? '💬 Special Instructions:\n' + special_instructions : ''}`
      ]
    );

    res.status(201).json({
      success: true,
      order: rows[0],
      message: 'Order placed successfully! Your food will be delivered soon.'
    });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// Get restaurant info and menu from public token
router.get('/delivery/public/:token', async (req, res) => {
  try {
    const { rows: tokenRows } = await query(
      `SELECT dt.restaurant_id, r.name as restaurant_name, r.logo_url, r.tax_rate, r.city
       FROM delivery_tokens dt
       JOIN restaurants r ON dt.restaurant_id = r.id
       WHERE dt.token = $1`,
      [req.params.token]
    );
    
    if (!tokenRows[0]) {
      return res.status(404).json({ error: 'Invalid or expired delivery link' });
    }

    const restaurantId = tokenRows[0].restaurant_id;
    
    // Get menu items
    const { rows: menuRows } = await query(
      `SELECT id, name, category, price, description, image_url, available 
       FROM menu_items 
       WHERE restaurant_id = $1 AND available = TRUE 
       ORDER BY category, name`,
      [restaurantId]
    );

    res.json({
      restaurant: {
        id: tokenRows[0].restaurant_id,
        name: tokenRows[0].restaurant_name,
        logo: tokenRows[0].logo_url,
        taxRate: tokenRows[0].tax_rate || 5,
        city: tokenRows[0].city
      },
      menu: menuRows
    });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// Create customer delivery order (public)
router.post('/delivery/public/order', async (req, res) => {
  try {
    const { 
      token, 
      customer_name, 
      customer_phone, 
      customer_email,
      delivery_address,
      landmark,
      pincode,
      items,
      subtotal,
      delivery_fee,
      tax,
      total,
      payment_method,
      special_instructions
    } = req.body;

    // Validate required fields
    if (!token || !customer_name || !customer_phone || !delivery_address || !items || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify token and get restaurant_id
    const { rows: tokenRows } = await query(
      `SELECT restaurant_id FROM delivery_tokens WHERE token = $1`,
      [token]
    );
    
    if (!tokenRows[0]) {
      return res.status(401).json({ error: 'Invalid delivery link' });
    }

    const restaurantId = tokenRows[0].restaurant_id;
    
    // Generate order number
    const orderNumber = `DEL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // Calculate estimated delivery time (45 mins from now)
    const estimatedTime = new Date(Date.now() + 45 * 60 * 1000).toLocaleTimeString('en-IN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    // Insert delivery order
    const { rows } = await query(
      `INSERT INTO customer_delivery_orders (
        restaurant_id, order_number, customer_name, customer_phone, customer_email,
        delivery_address, landmark, pincode, items, subtotal, delivery_fee, tax, total,
        payment_method, payment_status, delivery_status, special_instructions, 
        estimated_delivery_time, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
      RETURNING *`,
      [
        restaurantId, orderNumber, customer_name.trim(), customer_phone.trim(), 
        customer_email || '', delivery_address.trim(), landmark || '', pincode || '',
        JSON.stringify(items), subtotal, delivery_fee, tax, total,
        payment_method || 'cod', 'pending', 'pending', special_instructions || '',
        estimatedTime
      ]
    );

    // Format items for KDS display - convert to proper format
    const formattedItems = items.map(item => `${item.name} x${item.quantity}`);

    // Also create entry in orders table for KDS
    await query(
      `INSERT INTO orders (
        restaurant_id, order_number, items, total, status, order_type, 
        payment_status, payment_method, notes, created_at
      ) VALUES ($1, $2, $3, $4, 'pending', 'delivery', $5, $6, $7, NOW())`,
      [
        restaurantId, orderNumber, JSON.stringify(formattedItems), total, 'pending', 
        payment_method || 'cod',
        `🚚 DELIVERY ORDER

📦 Customer: ${customer_name}
📞 Phone: ${customer_phone}

📍 Address:
${delivery_address}
${landmark ? '🏷️ Landmark: ' + landmark : ''}
${pincode ? '📮 Pincode: ' + pincode : ''}

${special_instructions ? '💬 Special Instructions:\n' + special_instructions : ''}`
      ]
    );

    res.status(201).json({
      success: true,
      order: rows[0],
      message: 'Order placed successfully! Your food will be delivered soon.'
    });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// Track delivery order status (public)
router.get('/delivery/public/track/:orderNumber', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT 
        order_number, customer_name, delivery_address, items, total, 
        payment_status, delivery_status, estimated_delivery_time, 
        created_at, updated_at
       FROM customer_delivery_orders 
       WHERE order_number = $1`,
      [req.params.orderNumber]
    );
    
    if (!rows[0]) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(rows[0]);
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

export default router;
