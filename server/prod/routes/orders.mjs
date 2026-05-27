import { Router } from 'express';
import { query } from '../db.mjs';
import { authenticate } from '../middleware/auth.mjs';

const router = Router();

// Lazy load printer service to handle missing module gracefully
let printerService = null;
const getPrinterService = async () => {
  if (printerService) return printerService;
  try {
    const { printerService: ps } = await import('../../services/printer.mjs');
    printerService = ps;
  } catch (err) {
    console.warn('⚠️ Printer service not available:', err.message);
    printerService = {
      printKoT: async () => ({ success: true, skipped: true }),
      printBill: async () => ({ success: true, skipped: true })
    };
  }
  return printerService;
};

// Public order endpoint for table QR ordering (no auth required)
router.post('/orders/public', async (req, res) => {
  try {
    const { items, total, table_number, notes } = req.body;
    if (!items || !total || !table_number) {
      return res.status(400).json({ error: 'items, total, and table_number required' });
    }

    // Get restaurant_id from table
    const { rows: tableRows } = await query(
      `SELECT restaurant_id FROM tables WHERE id = $1`,
      [table_number]
    );
    if (!tableRows[0]) return res.status(404).json({ error: 'Table not found' });

    const orderNum = `ORD-${Date.now()}`;
    const { rows } = await query(
      `INSERT INTO orders (restaurant_id, order_number, table_number, items, total, status, order_type, payment_status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [tableRows[0].restaurant_id, orderNum, table_number, JSON.stringify(items), Number(total), 'pending', 'dine-in', 'unpaid', notes || '']
    );
    res.status(201).json({ ...rows[0], items: rows[0].items });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/orders', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT o.*, COALESCE(t.section, 'Main Hall') as section FROM orders o 
       LEFT JOIN tables t ON o.table_number = t.table_number AND o.restaurant_id = t.restaurant_id
       WHERE o.restaurant_id=$1 ORDER BY o.created_at DESC`,
      [req.user.restaurantId]
    );
    res.json(rows.map(o => ({
      ...o,
      items: Array.isArray(o.items) ? o.items : [],
      orderType: o.order_type,
      paymentStatus: o.payment_status,
      paymentMethod: o.payment_method,
      tableSection: o.section,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/orders/table/:num', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM orders WHERE restaurant_id=$1 AND table_number=$2 AND payment_status='unpaid' ORDER BY created_at DESC LIMIT 1`,
      [req.user.restaurantId, Number(req.params.num)]
    );
    if (!rows[0]) return res.status(404).json({ error: 'No active order for this table' });
    const o = rows[0];
    res.json({
      ...o,
      items: Array.isArray(o.items) ? o.items : [],
      orderType: o.order_type,
      paymentStatus: o.payment_status,
      paymentMethod: o.payment_method,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/orders', authenticate, async (req, res) => {
  try {
    const { items, total, table_number, orderType, paymentMethod, userId } = req.body;
    if (!items || !total) return res.status(400).json({ error: 'items and total required' });

    const orderNum = `ORD-${Date.now()}`;
    const payStatus = (orderType === 'delivery' || orderType === 'take-away') ? 'paid' : 'unpaid';
    const orderStatus = 'pending'; // Always start as pending - kitchen needs to prepare

    // Convert items to string format for storage: "Item Name x qty (note)"
    const itemsForStorage = items.map(item => {
      const note = item.note ? ` (${item.note})` : '';
      return `${item.name} x${item.qty}${note}`;
    });

    const { rows } = await query(
      `INSERT INTO orders (restaurant_id, user_id, order_number, table_number, items, total, status, order_type, payment_status, payment_method)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.restaurantId, userId || req.user.id, orderNum, table_number || null, JSON.stringify(itemsForStorage), Number(total), orderStatus, orderType || 'dine-in', payStatus, paymentMethod || null]
    );

    const order = rows[0];

    // Print KoT if printer is enabled and order is dine-in
    if (orderType === 'dine-in' || !orderType) {
      try {
        const { rows: restaurantRows } = await query(
          `SELECT id, name, kitchen_printer_ip, kitchen_printer_port FROM restaurants WHERE id=$1`,
          [req.user.restaurantId]
        );
        
        if (restaurantRows[0]) {
          const restaurant = restaurantRows[0];
          const printer = await getPrinterService();
          const printResult = await printer.printKoT(
            {
              id: order.id,
              table_number: order.table_number,
              table_capacity: 4, // TODO: Get from tables table
              items: Array.isArray(order.items) ? order.items : [],
              orderType: order.order_type
            },
            restaurant
          );
          console.log('KoT Print Result:', printResult);
        }
      } catch (printError) {
        console.error('KoT printing error (non-blocking):', printError.message);
        // Don't fail the order creation if printer fails
      }
    }

    res.status(201).json({ ...order, items: order.items });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/orders/:id', authenticate, async (req, res) => {
  try {
    const { items, total, status, paymentStatus, paymentMethod } = req.body;
    
    // Convert items to string format if provided
    let itemsForStorage = null;
    if (items) {
      itemsForStorage = items.map(item => {
        const note = item.note ? ` (${item.note})` : '';
        return `${item.name} x${item.qty}${note}`;
      });
    }

    const { rows } = await query(
      `UPDATE orders SET
        items=COALESCE($1::jsonb, items),
        total=COALESCE($2, total),
        status=COALESCE($3, status),
        payment_status=COALESCE($4, payment_status),
        payment_method=COALESCE($5, payment_method),
        updated_at=NOW()
       WHERE id=$6 AND restaurant_id=$7 RETURNING *`,
      [itemsForStorage ? JSON.stringify(itemsForStorage) : null, total ? Number(total) : null, status || null, paymentStatus || null, paymentMethod || null, req.params.id, req.user.restaurantId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    
    const order = rows[0];

    // Print Bill if payment is marked as paid
    if (paymentStatus === 'paid') {
      try {
        const { rows: restaurantRows } = await query(
          `SELECT id, name, counter_printer_ip, counter_printer_port, tax_rate FROM restaurants WHERE id=$1`,
          [req.user.restaurantId]
        );
        
        if (restaurantRows[0]) {
          const restaurant = restaurantRows[0];
          const printer = await getPrinterService();
          const printResult = await printer.printBill(
            {
              id: order.id,
              table_number: order.table_number,
              items: Array.isArray(order.items) ? order.items : [],
              total: order.total
            },
            {
              paymentMethod: paymentMethod || order.payment_method,
              amount: total || order.total
            },
            restaurant
          );
          console.log('Bill Print Result:', printResult);
        }
      } catch (printError) {
        console.error('Bill printing error (non-blocking):', printError.message);
        // Don't fail the payment if printer fails
      }
    }

    res.json({ ...order, items: Array.isArray(order.items) ? order.items : [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/orders/:id/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status required' });
    const { rows } = await query(
      `UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2 AND restaurant_id=$3 RETURNING *`,
      [status, req.params.id, req.user.restaurantId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    
    // Update table status based on order status
    if (rows[0].table_number) {
      if (status === "served") {
        // When order is served, table remains occupied (customer is eating)
        await query(
          `UPDATE tables SET status='occupied', current_order=$1, estimated_time='Eating' 
           WHERE table_number=$2 AND restaurant_id=$3`,
          [rows[0].order_number, rows[0].table_number, req.user.restaurantId]
        );
      } else if (status === "completed") {
        // When order is completed, table becomes available (customer left)
        await query(
          `UPDATE tables SET status='available', current_order=NULL, estimated_time=NULL 
           WHERE table_number=$1 AND restaurant_id=$2`,
          [rows[0].table_number, req.user.restaurantId]
        );
      }
    }
    
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
