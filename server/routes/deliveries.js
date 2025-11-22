import express from 'express';
import db from '../config/db.js';

const router = express.Router();

// Generate delivery number
const generateDeliveryNumber = async () => {
  const prefix = 'DEL';
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const result = await db.query(
    "SELECT COUNT(*) FROM deliveries WHERE delivery_number LIKE $1",
    [`${prefix}-${date}%`]
  );
  const count = parseInt(result.rows[0].count) + 1;
  return `${prefix}-${date}-${String(count).padStart(4, '0')}`;
};

// Get all deliveries with filters
router.get('/', async (req, res) => {
  try {
    const { status, warehouse_id } = req.query;
    
    let query = `
      SELECT d.*, w.name as warehouse_name,
             u.name as user_name,
             COUNT(di.id) as item_count
      FROM deliveries d
      JOIN warehouses w ON d.warehouse_id = w.id
      JOIN users u ON d.user_id = u.id
      LEFT JOIN delivery_items di ON d.id = di.delivery_id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (status) {
      query += ` AND d.status = $${paramCount++}`;
      params.push(status);
    }

    if (warehouse_id) {
      query += ` AND d.warehouse_id = $${paramCount++}`;
      params.push(warehouse_id);
    }

    query += ' GROUP BY d.id, w.name, u.name ORDER BY d.created_at DESC';

    const result = await db.query(query, params);
    res.json({ deliveries: result.rows });
  } catch (error) {
    console.error('Get deliveries error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single delivery with items
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const deliveryResult = await db.query(
      `SELECT d.*, w.name as warehouse_name, u.name as user_name
       FROM deliveries d
       JOIN warehouses w ON d.warehouse_id = w.id
       JOIN users u ON d.user_id = u.id
       WHERE d.id = $1`,
      [id]
    );

    if (deliveryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const delivery = deliveryResult.rows[0];

    const itemsResult = await db.query(
      `SELECT di.*, p.name as product_name, p.sku, p.unit_of_measure
       FROM delivery_items di
       JOIN products p ON di.product_id = p.id
       WHERE di.delivery_id = $1`,
      [id]
    );

    delivery.items = itemsResult.rows;

    res.json({ delivery });
  } catch (error) {
    console.error('Get delivery error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create delivery
router.post('/', async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');

    const { customer, warehouse_id, items, notes } = req.body;

    if (!warehouse_id || !items || items.length === 0) {
      return res.status(400).json({ error: 'Warehouse and items are required' });
    }

    // Generate delivery number
    const deliveryNumber = await generateDeliveryNumber();

    // Create delivery
    const deliveryResult = await client.query(
      `INSERT INTO deliveries (delivery_number, customer, warehouse_id, status, user_id, notes)
       VALUES ($1, $2, $3, 'draft', $4, $5)
       RETURNING *`,
      [deliveryNumber, customer || null, warehouse_id, req.user.id, notes || null]
    );

    const delivery = deliveryResult.rows[0];

    // Add items
    for (const item of items) {
      await client.query(
        'INSERT INTO delivery_items (delivery_id, product_id, quantity) VALUES ($1, $2, $3)',
        [delivery.id, item.product_id, item.quantity]
      );
    }

    await client.query('COMMIT');
    client.release();

    res.status(201).json({ message: 'Delivery created successfully', delivery });
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    console.error('Create delivery error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update delivery
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { customer, warehouse_id, items, notes, status } = req.body;

    // Check if delivery exists
    const deliveryCheck = await db.query('SELECT * FROM deliveries WHERE id = $1', [id]);
    if (deliveryCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const currentDelivery = deliveryCheck.rows[0];

    // If status is being changed to 'done', update stock
    if (status === 'done' && currentDelivery.status !== 'done') {
      const client = await db.pool.connect();
      
      try {
        await client.query('BEGIN');

        // Get items
        const itemsResult = await client.query(
          'SELECT * FROM delivery_items WHERE delivery_id = $1',
          [id]
        );

        // Update stock for each item
        for (const item of itemsResult.rows) {
          // Check available stock
          const stockResult = await client.query(
            'SELECT quantity FROM stock WHERE product_id = $1 AND warehouse_id = $2',
            [item.product_id, currentDelivery.warehouse_id]
          );

          if (stockResult.rows.length === 0 || stockResult.rows[0].quantity < item.quantity) {
            throw new Error(`Insufficient stock for product ${item.product_id}`);
          }

          // Update stock
          await client.query(
            `UPDATE stock SET quantity = quantity - $1
             WHERE product_id = $2 AND warehouse_id = $3`,
            [item.quantity, item.product_id, currentDelivery.warehouse_id]
          );

          // Get current stock after update
          const updatedStockResult = await client.query(
            'SELECT quantity FROM stock WHERE product_id = $1 AND warehouse_id = $2',
            [item.product_id, currentDelivery.warehouse_id]
          );
          const quantityAfter = updatedStockResult.rows[0]?.quantity || 0;

          // Log in stock ledger
          await client.query(
            `INSERT INTO stock_ledger (product_id, warehouse_id, movement_type, reference_type, reference_id, quantity_change, quantity_after, user_id, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              item.product_id,
              currentDelivery.warehouse_id,
              'out',
              'delivery',
              id,
              -item.quantity,
              quantityAfter,
              req.user.id,
              'Delivery validated'
            ]
          );
        }

        // Update delivery status
        await client.query(
          'UPDATE deliveries SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [status, id]
        );

        await client.query('COMMIT');
        client.release();
      } catch (error) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({ error: error.message || 'Failed to validate delivery' });
      }
    } else {
      // Just update delivery fields
      await db.query(
        `UPDATE deliveries
         SET customer = COALESCE($1, customer),
             warehouse_id = COALESCE($2, warehouse_id),
             notes = COALESCE($3, notes),
             status = COALESCE($4, status),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [customer, warehouse_id, notes, status, id]
      );

      // Update items if provided
      if (items && currentDelivery.status === 'draft') {
        await db.query('DELETE FROM delivery_items WHERE delivery_id = $1', [id]);
        
        for (const item of items) {
          await db.query(
            'INSERT INTO delivery_items (delivery_id, product_id, quantity) VALUES ($1, $2, $3)',
            [id, item.product_id, item.quantity]
          );
        }
      }
    }

    const result = await db.query('SELECT * FROM deliveries WHERE id = $1', [id]);
    res.json({ message: 'Delivery updated successfully', delivery: result.rows[0] });
  } catch (error) {
    console.error('Update delivery error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete delivery
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const deliveryCheck = await db.query('SELECT status FROM deliveries WHERE id = $1', [id]);
    if (deliveryCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    if (deliveryCheck.rows[0].status === 'done') {
      return res.status(400).json({ error: 'Cannot delete validated delivery' });
    }

    await db.query('DELETE FROM deliveries WHERE id = $1', [id]);
    res.json({ message: 'Delivery deleted successfully' });
  } catch (error) {
    console.error('Delete delivery error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

