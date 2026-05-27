import { Router } from 'express';
import { query } from '../db.mjs';
import { authenticate } from '../middleware/auth.mjs';
import { uploadBase64Image } from '../middleware/upload.mjs';

const router = Router();

// Public menu endpoint for table QR ordering (no auth required)
router.get('/menu/public/:tableId', async (req, res) => {
  try {
    const { tableId } = req.params;
    // Get restaurant_id from table
    const { rows: tableRows } = await query(
      `SELECT restaurant_id FROM tables WHERE id = $1`,
      [tableId]
    );
    if (!tableRows[0]) return res.status(404).json({ error: 'Table not found' });

    const { rows } = await query(
      `SELECT id, name, category, price, image_url, description, available FROM menu_items WHERE restaurant_id = $1 AND available = true ORDER BY category, name`,
      [tableRows[0].restaurant_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/menu', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, name, category, price, image_url, description, available FROM menu_items WHERE restaurant_id = $1 ORDER BY category, name`,
      [req.user.restaurantId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/menu', authenticate, async (req, res) => {
  try {
    const { name, category, price, image_url, description, available } = req.body;
    if (!name || !category || !price) return res.status(400).json({ error: 'Name, category, price required' });

    const imgUrl = image_url ? await uploadBase64Image(image_url, 'logdine/menu') : '';

    const { rows } = await query(
      `INSERT INTO menu_items (restaurant_id, name, category, price, image_url, description, available)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.restaurantId, name.trim(), category, Number(price), imgUrl, description || '', available !== false]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/menu/:id', authenticate, async (req, res) => {
  try {
    const { name, category, price, image_url, description, available } = req.body;
    // Only process image if provided; if empty/null, keep existing image
    let imgUrl = undefined;
    if (image_url) {
      imgUrl = await uploadBase64Image(image_url, 'logdine/menu');
    }

    const { rows } = await query(
      `UPDATE menu_items SET
        name=COALESCE($1,name),
        category=COALESCE($2,category),
        price=COALESCE($3,price),
        image_url=COALESCE($4,image_url),
        description=COALESCE($5,description),
        available=COALESCE($6,available)
       WHERE id=$7 AND restaurant_id=$8 RETURNING *`,
      [name||null, category||null, price ? Number(price) : null, imgUrl||null, description !== undefined ? description : null, available !== undefined ? available !== false : null, req.params.id, req.user.restaurantId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/menu/:id', authenticate, async (req, res) => {
  try {
    await query(`DELETE FROM menu_items WHERE id=$1 AND restaurant_id=$2`, [req.params.id, req.user.restaurantId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/menu/image', authenticate, async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'Image required' });
    const url = await uploadBase64Image(image, 'logdine/menu');
    res.json({ url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Bulk import menu items from CSV
router.post('/menu/bulk', authenticate, async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array required' });
    }

    const inserted = [];
    const skipped = [];

    for (const item of items) {
      const name = String(item.name || '').trim();
      const category = String(item.category || 'General').trim();
      const price = Number(item.price);
      const description = String(item.description || '').trim();
      const image_url = String(item.image_url || '').trim();
      const available = item.available !== false && item.available !== 'false';

      if (!name || isNaN(price) || price <= 0) {
        skipped.push({ row: item, reason: 'Missing name or invalid price' });
        continue;
      }

      const { rows } = await query(
        `INSERT INTO menu_items (restaurant_id, name, category, price, image_url, description, available)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [req.user.restaurantId, name, category, price, image_url, description, available]
      );
      inserted.push(rows[0]);
    }

    res.status(201).json({
      inserted: inserted.length,
      skipped: skipped.length,
      errors: skipped,
      items: inserted,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
