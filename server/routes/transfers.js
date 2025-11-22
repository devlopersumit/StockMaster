import express from 'express';
import db from '../config/db.js';

const router = express.Router();

// Generate transfer number
const generateTransferNumber = async () => {
  const prefix = 'TRF';
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const result = await db.query(
    "SELECT COUNT(*) FROM transfers WHERE transfer_number LIKE $1",
    [`${prefix}-${date}%`]
  );
  const count = parseInt(result.rows[0].count) + 1;
  return `${prefix}-${date}-${String(count).padStart(4, '0')}`;
};

// Get all transfers with filters
router.get('/', async (req, res) => {
  try {
    const { status, warehouse_id } = req.query;
    
    let query = `
      SELECT t.*, 
             w1.name as from_warehouse_name,
             w2.name as to_warehouse_name,
             u.name as user_name,
             COUNT(ti.id) as item_count
      FROM transfers t
      JOIN warehouses w1 ON t.from_warehouse_id = w1.id
      JOIN warehouses w2 ON t.to_warehouse_id = w2.id
      JOIN users u ON t.user_id = u.id
      LEFT JOIN transfer_items ti ON t.id = ti.transfer_id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (status) {
      query += ` AND t.status = $${paramCount++}`;
      params.push(status);
    }

    if (warehouse_id) {
      query += ` AND (t.from_warehouse_id = $${paramCount} OR t.to_warehouse_id = $${paramCount})`;
      params.push(warehouse_id);
      paramCount++;
    }

    query += ' GROUP BY t.id, w1.name, w2.name, u.name ORDER BY t.created_at DESC';

    const result = await db.query(query, params);
    res.json({ transfers: result.rows });
  } catch (error) {
    console.error('Get transfers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single transfer with items
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const transferResult = await db.query(
      `SELECT t.*, 
              w1.name as from_warehouse_name,
              w2.name as to_warehouse_name,
              u.name as user_name
       FROM transfers t
       JOIN warehouses w1 ON t.from_warehouse_id = w1.id
       JOIN warehouses w2 ON t.to_warehouse_id = w2.id
       JOIN users u ON t.user_id = u.id
       WHERE t.id = $1`,
      [id]
    );

    if (transferResult.rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const transfer = transferResult.rows[0];

    const itemsResult = await db.query(
      `SELECT ti.*, p.name as product_name, p.sku, p.unit_of_measure
       FROM transfer_items ti
       JOIN products p ON ti.product_id = p.id
       WHERE ti.transfer_id = $1`,
      [id]
    );

    transfer.items = itemsResult.rows;

    res.json({ transfer });
  } catch (error) {
    console.error('Get transfer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create transfer
router.post('/', async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');

    const { from_warehouse_id, to_warehouse_id, items, notes } = req.body;

    if (!from_warehouse_id || !to_warehouse_id || !items || items.length === 0) {
      return res.status(400).json({ error: 'Warehouses and items are required' });
    }

    if (from_warehouse_id === to_warehouse_id) {
      return res.status(400).json({ error: 'Source and destination warehouses cannot be the same' });
    }

    // Generate transfer number
    const transferNumber = await generateTransferNumber();

    // Create transfer
    const transferResult = await client.query(
      `INSERT INTO transfers (transfer_number, from_warehouse_id, to_warehouse_id, status, user_id, notes)
       VALUES ($1, $2, $3, 'draft', $4, $5)
       RETURNING *`,
      [transferNumber, from_warehouse_id, to_warehouse_id, req.user.id, notes || null]
    );

    const transfer = transferResult.rows[0];

    // Add items
    for (const item of items) {
      await client.query(
        'INSERT INTO transfer_items (transfer_id, product_id, quantity) VALUES ($1, $2, $3)',
        [transfer.id, item.product_id, item.quantity]
      );
    }

    await client.query('COMMIT');
    client.release();

    res.status(201).json({ message: 'Transfer created successfully', transfer });
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    console.error('Create transfer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update transfer
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { from_warehouse_id, to_warehouse_id, items, notes, status } = req.body;

    // Check if transfer exists
    const transferCheck = await db.query('SELECT * FROM transfers WHERE id = $1', [id]);
    if (transferCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const currentTransfer = transferCheck.rows[0];

    // If status is being changed to 'done', update stock
    if (status === 'done' && currentTransfer.status !== 'done') {
      const client = await db.pool.connect();
      
      try {
        await client.query('BEGIN');

        // Get items
        const itemsResult = await client.query(
          'SELECT * FROM transfer_items WHERE transfer_id = $1',
          [id]
        );

        // Update stock for each item
        for (const item of itemsResult.rows) {
          // Check available stock in source warehouse
          const stockResult = await client.query(
            'SELECT quantity FROM stock WHERE product_id = $1 AND warehouse_id = $2',
            [item.product_id, currentTransfer.from_warehouse_id]
          );

          if (stockResult.rows.length === 0 || stockResult.rows[0].quantity < item.quantity) {
            throw new Error(`Insufficient stock in source warehouse for product ${item.product_id}`);
          }

          // Decrease stock in source warehouse
          await client.query(
            `UPDATE stock SET quantity = quantity - $1
             WHERE product_id = $2 AND warehouse_id = $3`,
            [item.quantity, item.product_id, currentTransfer.from_warehouse_id]
          );

          // Get stock after decrease
          const fromStockResult = await client.query(
            'SELECT quantity FROM stock WHERE product_id = $1 AND warehouse_id = $2',
            [item.product_id, currentTransfer.from_warehouse_id]
          );
          const fromQuantityAfter = fromStockResult.rows[0]?.quantity || 0;

          // Increase stock in destination warehouse
          await client.query(
            `INSERT INTO stock (product_id, warehouse_id, quantity)
             VALUES ($1, $2, $3)
             ON CONFLICT (product_id, warehouse_id)
             DO UPDATE SET quantity = stock.quantity + $3`,
            [item.product_id, currentTransfer.to_warehouse_id, item.quantity]
          );

          // Get stock after increase
          const toStockResult = await client.query(
            'SELECT quantity FROM stock WHERE product_id = $1 AND warehouse_id = $2',
            [item.product_id, currentTransfer.to_warehouse_id]
          );
          const toQuantityAfter = toStockResult.rows[0]?.quantity || 0;

          // Log in stock ledger - out from source
          await client.query(
            `INSERT INTO stock_ledger (product_id, warehouse_id, movement_type, reference_type, reference_id, quantity_change, quantity_after, user_id, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              item.product_id,
              currentTransfer.from_warehouse_id,
              'out',
              'transfer',
              id,
              -item.quantity,
              fromQuantityAfter,
              req.user.id,
              `Transfer to warehouse ${currentTransfer.to_warehouse_id}`
            ]
          );

          // Log in stock ledger - in to destination
          await client.query(
            `INSERT INTO stock_ledger (product_id, warehouse_id, movement_type, reference_type, reference_id, quantity_change, quantity_after, user_id, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              item.product_id,
              currentTransfer.to_warehouse_id,
              'in',
              'transfer',
              id,
              item.quantity,
              toQuantityAfter,
              req.user.id,
              `Transfer from warehouse ${currentTransfer.from_warehouse_id}`
            ]
          );
        }

        // Update transfer status
        await client.query(
          'UPDATE transfers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [status, id]
        );

        await client.query('COMMIT');
        client.release();
      } catch (error) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({ error: error.message || 'Failed to validate transfer' });
      }
    } else {
      // Just update transfer fields
      await db.query(
        `UPDATE transfers
         SET from_warehouse_id = COALESCE($1, from_warehouse_id),
             to_warehouse_id = COALESCE($2, to_warehouse_id),
             notes = COALESCE($3, notes),
             status = COALESCE($4, status),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [from_warehouse_id, to_warehouse_id, notes, status, id]
      );

      // Update items if provided
      if (items && currentTransfer.status === 'draft') {
        await db.query('DELETE FROM transfer_items WHERE transfer_id = $1', [id]);
        
        for (const item of items) {
          await db.query(
            'INSERT INTO transfer_items (transfer_id, product_id, quantity) VALUES ($1, $2, $3)',
            [id, item.product_id, item.quantity]
          );
        }
      }
    }

    const result = await db.query('SELECT * FROM transfers WHERE id = $1', [id]);
    res.json({ message: 'Transfer updated successfully', transfer: result.rows[0] });
  } catch (error) {
    console.error('Update transfer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete transfer
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const transferCheck = await db.query('SELECT status FROM transfers WHERE id = $1', [id]);
    if (transferCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    if (transferCheck.rows[0].status === 'done') {
      return res.status(400).json({ error: 'Cannot delete validated transfer' });
    }

    await db.query('DELETE FROM transfers WHERE id = $1', [id]);
    res.json({ message: 'Transfer deleted successfully' });
  } catch (error) {
    console.error('Delete transfer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

