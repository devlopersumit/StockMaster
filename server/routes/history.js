import express from 'express';
import db from '../config/db.js';

const router = express.Router();

// Get move history (stock ledger)
router.get('/moves', async (req, res) => {
  try {
    const { product_id, warehouse_id, movement_type, reference_type, start_date, end_date, limit = 100 } = req.query;
    
    let query = `
      SELECT sl.*, 
             p.name as product_name, p.sku,
             w.name as warehouse_name,
             u.name as user_name
      FROM stock_ledger sl
      JOIN products p ON sl.product_id = p.id
      JOIN warehouses w ON sl.warehouse_id = w.id
      JOIN users u ON sl.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (product_id) {
      query += ` AND sl.product_id = $${paramCount++}`;
      params.push(product_id);
    }

    if (warehouse_id) {
      query += ` AND sl.warehouse_id = $${paramCount++}`;
      params.push(warehouse_id);
    }

    if (movement_type) {
      query += ` AND sl.movement_type = $${paramCount++}`;
      params.push(movement_type);
    }

    if (reference_type) {
      query += ` AND sl.reference_type = $${paramCount++}`;
      params.push(reference_type);
    }

    if (start_date) {
      query += ` AND sl.created_at >= $${paramCount++}`;
      params.push(start_date);
    }

    if (end_date) {
      query += ` AND sl.created_at <= $${paramCount++}`;
      params.push(end_date);
    }

    query += ` ORDER BY sl.created_at DESC LIMIT $${paramCount++}`;
    params.push(limit);

    const result = await db.query(query, params);
    res.json({ movements: result.rows });
  } catch (error) {
    console.error('Get move history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

