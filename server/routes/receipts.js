import express from 'express';
import db from '../config/db.js';

const router = express.Router();

// Generate receipt number
const generateReceiptNumber = async () => {
  const prefix = 'REC';
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const result = await db.query(
    "SELECT COUNT(*) FROM receipts WHERE receipt_number LIKE $1",
    [`${prefix}-${date}%`]
  );
  const count = parseInt(result.rows[0].count) + 1;
  return `${prefix}-${date}-${String(count).padStart(4, '0')}`;
};

// Get all receipts with filters
router.get('/', async (req, res) => {
  try {
    const { status, warehouse_id, document_type } = req.query;
    
    let query = `
      SELECT r.*, w.name as warehouse_name,
             u.name as user_name,
             COUNT(ri.id) as item_count
      FROM receipts r
      JOIN warehouses w ON r.warehouse_id = w.id
      JOIN users u ON r.user_id = u.id
      LEFT JOIN receipt_items ri ON r.id = ri.receipt_id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (status) {
      query += ` AND r.status = $${paramCount++}`;
      params.push(status);
    }

    if (warehouse_id) {
      query += ` AND r.warehouse_id = $${paramCount++}`;
      params.push(warehouse_id);
    }

    query += ' GROUP BY r.id, w.name, u.name ORDER BY r.created_at DESC';

    const result = await db.query(query, params);
    res.json({ receipts: result.rows });
  } catch (error) {
    console.error('Get receipts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single receipt with items
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const receiptResult = await db.query(
      `SELECT r.*, w.name as warehouse_name, u.name as user_name
       FROM receipts r
       JOIN warehouses w ON r.warehouse_id = w.id
       JOIN users u ON r.user_id = u.id
       WHERE r.id = $1`,
      [id]
    );

    if (receiptResult.rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const receipt = receiptResult.rows[0];

    const itemsResult = await db.query(
      `SELECT ri.*, p.name as product_name, p.sku, p.unit_of_measure
       FROM receipt_items ri
       JOIN products p ON ri.product_id = p.id
       WHERE ri.receipt_id = $1`,
      [id]
    );

    receipt.items = itemsResult.rows;

    res.json({ receipt });
  } catch (error) {
    console.error('Get receipt error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create receipt
router.post('/', async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');

    const { supplier, warehouse_id, items, notes } = req.body;

    if (!warehouse_id || !items || items.length === 0) {
      return res.status(400).json({ error: 'Warehouse and items are required' });
    }

    // Generate receipt number
    const receiptNumber = await generateReceiptNumber();

    // Create receipt
    const receiptResult = await client.query(
      `INSERT INTO receipts (receipt_number, supplier, warehouse_id, status, user_id, notes)
       VALUES ($1, $2, $3, 'draft', $4, $5)
       RETURNING *`,
      [receiptNumber, supplier || null, warehouse_id, req.user.id, notes || null]
    );

    const receipt = receiptResult.rows[0];

    // Add items
    for (const item of items) {
      await client.query(
        'INSERT INTO receipt_items (receipt_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)',
        [receipt.id, item.product_id, item.quantity, item.unit_price || null]
      );
    }

    await client.query('COMMIT');
    client.release();

    res.status(201).json({ message: 'Receipt created successfully', receipt });
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    console.error('Create receipt error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update receipt
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { supplier, warehouse_id, items, notes, status } = req.body;

    // Check if receipt exists
    const receiptCheck = await db.query('SELECT * FROM receipts WHERE id = $1', [id]);
    if (receiptCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const currentReceipt = receiptCheck.rows[0];

    // If status is being changed to 'done', update stock
    if (status === 'done' && currentReceipt.status !== 'done') {
      const client = await db.pool.connect();
      
      try {
        await client.query('BEGIN');

        // Get items
        const itemsResult = await client.query(
          'SELECT * FROM receipt_items WHERE receipt_id = $1',
          [id]
        );

        // Update stock for each item
        for (const item of itemsResult.rows) {
          // Update or insert stock
          await client.query(
            `INSERT INTO stock (product_id, warehouse_id, quantity)
             VALUES ($1, $2, $3)
             ON CONFLICT (product_id, warehouse_id)
             DO UPDATE SET quantity = stock.quantity + $3`,
            [item.product_id, currentReceipt.warehouse_id, item.quantity]
          );

          // Get current stock after update
          const stockResult = await client.query(
            'SELECT quantity FROM stock WHERE product_id = $1 AND warehouse_id = $2',
            [item.product_id, currentReceipt.warehouse_id]
          );
          const quantityAfter = stockResult.rows[0]?.quantity || 0;

          // Log in stock ledger
          await client.query(
            `INSERT INTO stock_ledger (product_id, warehouse_id, movement_type, reference_type, reference_id, quantity_change, quantity_after, user_id, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              item.product_id,
              currentReceipt.warehouse_id,
              'in',
              'receipt',
              id,
              item.quantity,
              quantityAfter,
              req.user.id,
              'Receipt validated'
            ]
          );
        }

        // Update receipt status
        await client.query(
          'UPDATE receipts SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [status, id]
        );

        await client.query('COMMIT');
        client.release();
      } catch (error) {
        await client.query('ROLLBACK');
        client.release();
        throw error;
      }
    } else {
      // Just update receipt fields
      await db.query(
        `UPDATE receipts
         SET supplier = COALESCE($1, supplier),
             warehouse_id = COALESCE($2, warehouse_id),
             notes = COALESCE($3, notes),
             status = COALESCE($4, status),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [supplier, warehouse_id, notes, status, id]
      );

      // Update items if provided
      if (items && currentReceipt.status === 'draft') {
        await db.query('DELETE FROM receipt_items WHERE receipt_id = $1', [id]);
        
        for (const item of items) {
          await db.query(
            'INSERT INTO receipt_items (receipt_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)',
            [id, item.product_id, item.quantity, item.unit_price || null]
          );
        }
      }
    }

    const result = await db.query('SELECT * FROM receipts WHERE id = $1', [id]);
    res.json({ message: 'Receipt updated successfully', receipt: result.rows[0] });
  } catch (error) {
    console.error('Update receipt error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete receipt
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const receiptCheck = await db.query('SELECT status FROM receipts WHERE id = $1', [id]);
    if (receiptCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    if (receiptCheck.rows[0].status === 'done') {
      return res.status(400).json({ error: 'Cannot delete validated receipt' });
    }

    await db.query('DELETE FROM receipts WHERE id = $1', [id]);
    res.json({ message: 'Receipt deleted successfully' });
  } catch (error) {
    console.error('Delete receipt error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

