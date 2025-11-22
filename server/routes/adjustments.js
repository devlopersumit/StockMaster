import express from 'express';
import db from '../config/db.js';

const router = express.Router();

// Generate adjustment number
const generateAdjustmentNumber = async () => {
  const prefix = 'ADJ';
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const result = await db.query(
    "SELECT COUNT(*) FROM adjustments WHERE adjustment_number LIKE $1",
    [`${prefix}-${date}%`]
  );
  const count = parseInt(result.rows[0].count) + 1;
  return `${prefix}-${date}-${String(count).padStart(4, '0')}`;
};

// Get all adjustments with filters
router.get('/', async (req, res) => {
  try {
    const { status, warehouse_id } = req.query;
    
    let query = `
      SELECT a.*, w.name as warehouse_name,
             u.name as user_name,
             COUNT(ai.id) as item_count
      FROM adjustments a
      JOIN warehouses w ON a.warehouse_id = w.id
      JOIN users u ON a.user_id = u.id
      LEFT JOIN adjustment_items ai ON a.id = ai.adjustment_id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (status) {
      query += ` AND a.status = $${paramCount++}`;
      params.push(status);
    }

    if (warehouse_id) {
      query += ` AND a.warehouse_id = $${paramCount++}`;
      params.push(warehouse_id);
    }

    query += ' GROUP BY a.id, w.name, u.name ORDER BY a.created_at DESC';

    const result = await db.query(query, params);
    res.json({ adjustments: result.rows });
  } catch (error) {
    console.error('Get adjustments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single adjustment with items
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const adjustmentResult = await db.query(
      `SELECT a.*, w.name as warehouse_name, u.name as user_name
       FROM adjustments a
       JOIN warehouses w ON a.warehouse_id = w.id
       JOIN users u ON a.user_id = u.id
       WHERE a.id = $1`,
      [id]
    );

    if (adjustmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Adjustment not found' });
    }

    const adjustment = adjustmentResult.rows[0];

    const itemsResult = await db.query(
      `SELECT ai.*, p.name as product_name, p.sku, p.unit_of_measure
       FROM adjustment_items ai
       JOIN products p ON ai.product_id = p.id
       WHERE ai.adjustment_id = $1`,
      [id]
    );

    adjustment.items = itemsResult.rows;

    res.json({ adjustment });
  } catch (error) {
    console.error('Get adjustment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create adjustment
router.post('/', async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');

    const { warehouse_id, items, reason } = req.body;

    if (!warehouse_id || !items || items.length === 0) {
      return res.status(400).json({ error: 'Warehouse and items are required' });
    }

    // Generate adjustment number
    const adjustmentNumber = await generateAdjustmentNumber();

    // Create adjustment
    const adjustmentResult = await client.query(
      `INSERT INTO adjustments (adjustment_number, warehouse_id, status, user_id, reason)
       VALUES ($1, $2, 'draft', $3, $4)
       RETURNING *`,
      [adjustmentNumber, warehouse_id, req.user.id, reason || null]
    );

    const adjustment = adjustmentResult.rows[0];

    // Add items with recorded quantities
    for (const item of items) {
      // Get current recorded quantity
      const stockResult = await client.query(
        'SELECT quantity FROM stock WHERE product_id = $1 AND warehouse_id = $2',
        [item.product_id, warehouse_id]
      );
      const recordedQuantity = stockResult.rows.length > 0 ? stockResult.rows[0].quantity : 0;

      const difference = item.physical_quantity - recordedQuantity;

      await client.query(
        `INSERT INTO adjustment_items (adjustment_id, product_id, recorded_quantity, physical_quantity, difference)
         VALUES ($1, $2, $3, $4, $5)`,
        [adjustment.id, item.product_id, recordedQuantity, item.physical_quantity, difference]
      );
    }

    await client.query('COMMIT');
    client.release();

    res.status(201).json({ message: 'Adjustment created successfully', adjustment });
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    console.error('Create adjustment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update adjustment
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { warehouse_id, items, reason, status } = req.body;

    // Check if adjustment exists
    const adjustmentCheck = await db.query('SELECT * FROM adjustments WHERE id = $1', [id]);
    if (adjustmentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Adjustment not found' });
    }

    const currentAdjustment = adjustmentCheck.rows[0];

    // If status is being changed to 'done', update stock
    if (status === 'done' && currentAdjustment.status !== 'done') {
      const client = await db.pool.connect();
      
      try {
        await client.query('BEGIN');

        // Get items
        const itemsResult = await client.query(
          'SELECT * FROM adjustment_items WHERE adjustment_id = $1',
          [id]
        );

        // Update stock for each item
        for (const item of itemsResult.rows) {
          // Update stock to physical quantity
          await client.query(
            `INSERT INTO stock (product_id, warehouse_id, quantity)
             VALUES ($1, $2, $3)
             ON CONFLICT (product_id, warehouse_id)
             DO UPDATE SET quantity = $3`,
            [item.product_id, currentAdjustment.warehouse_id, item.physical_quantity]
          );

          // Get current stock after update
          const stockResult = await client.query(
            'SELECT quantity FROM stock WHERE product_id = $1 AND warehouse_id = $2',
            [item.product_id, currentAdjustment.warehouse_id]
          );
          const quantityAfter = stockResult.rows[0]?.quantity || 0;

          // Log in stock ledger
          await client.query(
            `INSERT INTO stock_ledger (product_id, warehouse_id, movement_type, reference_type, reference_id, quantity_change, quantity_after, user_id, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              item.product_id,
              currentAdjustment.warehouse_id,
              item.difference > 0 ? 'in' : 'out',
              'adjustment',
              id,
              item.difference,
              quantityAfter,
              req.user.id,
              currentAdjustment.reason || 'Stock adjustment'
            ]
          );
        }

        // Update adjustment status
        await client.query(
          'UPDATE adjustments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [status, id]
        );

        await client.query('COMMIT');
        client.release();
      } catch (error) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({ error: error.message || 'Failed to validate adjustment' });
      }
    } else {
      // Just update adjustment fields
      await db.query(
        `UPDATE adjustments
         SET warehouse_id = COALESCE($1, warehouse_id),
             reason = COALESCE($2, reason),
             status = COALESCE($3, status),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [warehouse_id, reason, status, id]
      );

      // Update items if provided
      if (items && currentAdjustment.status === 'draft') {
        await db.query('DELETE FROM adjustment_items WHERE adjustment_id = $1', [id]);
        
        for (const item of items) {
          // Get current recorded quantity
          const stockResult = await db.query(
            'SELECT quantity FROM stock WHERE product_id = $1 AND warehouse_id = $2',
            [item.product_id, currentAdjustment.warehouse_id]
          );
          const recordedQuantity = stockResult.rows.length > 0 ? stockResult.rows[0].quantity : 0;
          const difference = item.physical_quantity - recordedQuantity;

          await db.query(
            `INSERT INTO adjustment_items (adjustment_id, product_id, recorded_quantity, physical_quantity, difference)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, item.product_id, recordedQuantity, item.physical_quantity, difference]
          );
        }
      }
    }

    const result = await db.query('SELECT * FROM adjustments WHERE id = $1', [id]);
    res.json({ message: 'Adjustment updated successfully', adjustment: result.rows[0] });
  } catch (error) {
    console.error('Update adjustment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete adjustment
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const adjustmentCheck = await db.query('SELECT status FROM adjustments WHERE id = $1', [id]);
    if (adjustmentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Adjustment not found' });
    }

    if (adjustmentCheck.rows[0].status === 'done') {
      return res.status(400).json({ error: 'Cannot delete validated adjustment' });
    }

    await db.query('DELETE FROM adjustments WHERE id = $1', [id]);
    res.json({ message: 'Adjustment deleted successfully' });
  } catch (error) {
    console.error('Delete adjustment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

