import express from 'express';
import db from '../config/db.js';

const router = express.Router();

// Get dashboard KPIs
router.get('/kpis', async (req, res) => {
  try {
    const { warehouse_id } = req.query;

    // Total Products
    const productsResult = await db.query('SELECT COUNT(*) as total FROM products');
    const totalProducts = parseInt(productsResult.rows[0].total);

    // Low Stock Items (products where stock < reorder_level)
    let lowStockQuery = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM products p
      JOIN stock s ON p.id = s.product_id
      WHERE s.quantity <= p.reorder_level
    `;
    const lowStockParams = [];
    
    if (warehouse_id) {
      lowStockQuery += ' AND s.warehouse_id = $1';
      lowStockParams.push(warehouse_id);
    }
    
    const lowStockResult = await db.query(lowStockQuery, lowStockParams);
    const lowStockItems = parseInt(lowStockResult.rows[0].total);

    // Out of Stock Items
    let outOfStockQuery = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM products p
      LEFT JOIN stock s ON p.id = s.product_id ${warehouse_id ? 'AND s.warehouse_id = $1' : ''}
      WHERE s.quantity IS NULL OR s.quantity = 0
    `;
    const outOfStockResult = await db.query(
      outOfStockQuery,
      warehouse_id ? [warehouse_id] : []
    );
    const outOfStockItems = parseInt(outOfStockResult.rows[0].total);

    // Pending Receipts
    let pendingReceiptsQuery = `
      SELECT COUNT(*) as total
      FROM receipts
      WHERE status IN ('draft', 'waiting', 'ready')
    `;
    const pendingReceiptsParams = [];
    
    if (warehouse_id) {
      pendingReceiptsQuery += ' AND warehouse_id = $1';
      pendingReceiptsParams.push(warehouse_id);
    }
    
    const pendingReceiptsResult = await db.query(pendingReceiptsQuery, pendingReceiptsParams);
    const pendingReceipts = parseInt(pendingReceiptsResult.rows[0].total);

    // Pending Deliveries
    let pendingDeliveriesQuery = `
      SELECT COUNT(*) as total
      FROM deliveries
      WHERE status IN ('draft', 'waiting', 'ready')
    `;
    const pendingDeliveriesParams = [];
    
    if (warehouse_id) {
      pendingDeliveriesQuery += ' AND warehouse_id = $1';
      pendingDeliveriesParams.push(warehouse_id);
    }
    
    const pendingDeliveriesResult = await db.query(pendingDeliveriesQuery, pendingDeliveriesParams);
    const pendingDeliveries = parseInt(pendingDeliveriesResult.rows[0].total);

    // Internal Transfers Scheduled
    let pendingTransfersQuery = `
      SELECT COUNT(*) as total
      FROM transfers
      WHERE status IN ('draft', 'waiting', 'ready')
    `;
    const pendingTransfersParams = [];
    
    if (warehouse_id) {
      pendingTransfersQuery += ' AND (from_warehouse_id = $1 OR to_warehouse_id = $1)';
      pendingTransfersParams.push(warehouse_id);
    }
    
    const pendingTransfersResult = await db.query(pendingTransfersQuery, pendingTransfersParams);
    const pendingTransfers = parseInt(pendingTransfersResult.rows[0].total);

    res.json({
      totalProducts,
      lowStockItems,
      outOfStockItems,
      pendingReceipts,
      pendingDeliveries,
      pendingTransfers,
    });
  } catch (error) {
    console.error('Get dashboard KPIs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get recent activities
router.get('/recent-activities', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const result = await db.query(
      `SELECT sl.*, 
              p.name as product_name, p.sku,
              w.name as warehouse_name,
              u.name as user_name
       FROM stock_ledger sl
       JOIN products p ON sl.product_id = p.id
       JOIN warehouses w ON sl.warehouse_id = w.id
       JOIN users u ON sl.user_id = u.id
       ORDER BY sl.created_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json({ activities: result.rows });
  } catch (error) {
    console.error('Get recent activities error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get low stock products
router.get('/low-stock', async (req, res) => {
  try {
    const { warehouse_id } = req.query;

    let query = `
      SELECT p.*, 
             c.name as category_name,
             s.quantity as stock_quantity,
             s.warehouse_id,
             w.name as warehouse_name
      FROM products p
      JOIN stock s ON p.id = s.product_id
      JOIN warehouses w ON s.warehouse_id = w.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE s.quantity <= p.reorder_level
    `;
    const params = [];

    if (warehouse_id) {
      query += ' AND s.warehouse_id = $1';
      params.push(warehouse_id);
    }

    query += ' ORDER BY s.quantity ASC';

    const result = await db.query(query, params);
    res.json({ products: result.rows });
  } catch (error) {
    console.error('Get low stock products error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

