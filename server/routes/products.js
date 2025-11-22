import express from 'express';
import db from '../config/db.js';

const router = express.Router();

// Get all products with filters
router.get('/', async (req, res) => {
  try {
    const { category_id, search, warehouse_id } = req.query;
    let query = `
      SELECT p.*, c.name as category_name,
             COALESCE(s.quantity, 0) as total_stock
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN stock s ON p.id = s.product_id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (category_id) {
      query += ` AND p.category_id = $${paramCount++}`;
      params.push(category_id);
    }

    if (search) {
      query += ` AND (p.name ILIKE $${paramCount} OR p.sku ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    if (warehouse_id) {
      query = `
        SELECT p.*, c.name as category_name,
               COALESCE(s.quantity, 0) as stock_quantity
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN stock s ON p.id = s.product_id AND s.warehouse_id = $${paramCount}
        WHERE 1=1
      `;
      if (category_id) {
        query += ` AND p.category_id = $${paramCount++}`;
        params.unshift(warehouse_id);
        if (paramCount > 2) {
          params[1] = category_id;
        }
      } else {
        params.push(warehouse_id);
        paramCount++;
      }
      
      if (search) {
        query += ` AND (p.name ILIKE $${paramCount} OR p.sku ILIKE $${paramCount})`;
        params.push(`%${search}%`);
      }
    }

    query += ' ORDER BY p.created_at DESC';

    const result = await db.query(query, params);
    res.json({ products: result.rows });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { warehouse_id } = req.query;

    let query = `
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = $1
    `;
    
    const productResult = await db.query(query, [id]);
    
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = productResult.rows[0];

    // Get stock per warehouse
    let stockQuery = `
      SELECT s.*, w.name as warehouse_name, w.code as warehouse_code
      FROM stock s
      JOIN warehouses w ON s.warehouse_id = w.id
      WHERE s.product_id = $1
    `;
    const stockParams = [id];

    if (warehouse_id) {
      stockQuery += ' AND s.warehouse_id = $2';
      stockParams.push(warehouse_id);
    }

    const stockResult = await db.query(stockQuery, stockParams);
    product.stock = stockResult.rows;

    res.json({ product });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create product
router.post('/', async (req, res) => {
  try {
    const { name, sku, category_id, unit_of_measure, reorder_level, description, initial_stock, warehouse_id } = req.body;

    if (!name || !sku || !unit_of_measure) {
      return res.status(400).json({ error: 'Name, SKU, and unit of measure are required' });
    }

    // Check if SKU already exists
    const existingProduct = await db.query('SELECT id FROM products WHERE sku = $1', [sku]);
    if (existingProduct.rows.length > 0) {
      return res.status(400).json({ error: 'Product with this SKU already exists' });
    }

    // Create product
    const result = await db.query(
      `INSERT INTO products (name, sku, category_id, unit_of_measure, reorder_level, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, sku, category_id || null, unit_of_measure, reorder_level || 0, description || null]
    );

    const product = result.rows[0];

    // If initial stock is provided, add it
    if (initial_stock && warehouse_id) {
      await db.query(
        `INSERT INTO stock (product_id, warehouse_id, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (product_id, warehouse_id)
         DO UPDATE SET quantity = stock.quantity + $3`,
        [product.id, warehouse_id, initial_stock]
      );

      // Log in stock ledger
      await db.query(
        `INSERT INTO stock_ledger (product_id, warehouse_id, movement_type, reference_type, reference_id, quantity_change, quantity_after, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $6, $7)`,
        [product.id, warehouse_id, 'initial', 'product', product.id, initial_stock, req.user.id]
      );
    }

    res.status(201).json({ message: 'Product created successfully', product });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update product
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, sku, category_id, unit_of_measure, reorder_level, description } = req.body;

    // Check if product exists
    const existingProduct = await db.query('SELECT id FROM products WHERE id = $1', [id]);
    if (existingProduct.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if SKU is being changed and if it conflicts
    if (sku) {
      const skuCheck = await db.query('SELECT id FROM products WHERE sku = $1 AND id != $2', [sku, id]);
      if (skuCheck.rows.length > 0) {
        return res.status(400).json({ error: 'Product with this SKU already exists' });
      }
    }

    // Update product
    const result = await db.query(
      `UPDATE products
       SET name = COALESCE($1, name),
           sku = COALESCE($2, sku),
           category_id = COALESCE($3, category_id),
           unit_of_measure = COALESCE($4, unit_of_measure),
           reorder_level = COALESCE($5, reorder_level),
           description = COALESCE($6, description),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [name, sku, category_id, unit_of_measure, reorder_level, description, id]
    );

    res.json({ message: 'Product updated successfully', product: result.rows[0] });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete product
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get product categories
router.get('/categories/list', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM categories ORDER BY name');
    res.json({ categories: result.rows });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create category
router.post('/categories', async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const result = await db.query(
      'INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING *',
      [name, description || null]
    );

    res.status(201).json({ message: 'Category created successfully', category: result.rows[0] });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

