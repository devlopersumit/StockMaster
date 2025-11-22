import express from 'express';
import db from '../config/db.js';

const router = express.Router();

// Get all warehouses
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM warehouses ORDER BY created_at DESC');
    res.json({ warehouses: result.rows });
  } catch (error) {
    console.error('Get warehouses error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single warehouse
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM warehouses WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Warehouse not found' });
    }

    res.json({ warehouse: result.rows[0] });
  } catch (error) {
    console.error('Get warehouse error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create warehouse
router.post('/', async (req, res) => {
  try {
    const { name, code, location, description } = req.body;

    if (!name || !code) {
      return res.status(400).json({ error: 'Name and code are required' });
    }

    // Check if code already exists
    const existingWarehouse = await db.query('SELECT id FROM warehouses WHERE code = $1', [code]);
    if (existingWarehouse.rows.length > 0) {
      return res.status(400).json({ error: 'Warehouse with this code already exists' });
    }

    const result = await db.query(
      'INSERT INTO warehouses (name, code, location, description) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, code, location || null, description || null]
    );

    res.status(201).json({ message: 'Warehouse created successfully', warehouse: result.rows[0] });
  } catch (error) {
    console.error('Create warehouse error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update warehouse
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, location, description } = req.body;

    // Check if warehouse exists
    const existingWarehouse = await db.query('SELECT id FROM warehouses WHERE id = $1', [id]);
    if (existingWarehouse.rows.length === 0) {
      return res.status(404).json({ error: 'Warehouse not found' });
    }

    // Check if code is being changed and if it conflicts
    if (code) {
      const codeCheck = await db.query('SELECT id FROM warehouses WHERE code = $1 AND id != $2', [code, id]);
      if (codeCheck.rows.length > 0) {
        return res.status(400).json({ error: 'Warehouse with this code already exists' });
      }
    }

    const result = await db.query(
      `UPDATE warehouses
       SET name = COALESCE($1, name),
           code = COALESCE($2, code),
           location = COALESCE($3, location),
           description = COALESCE($4, description),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [name, code, location, description, id]
    );

    res.json({ message: 'Warehouse updated successfully', warehouse: result.rows[0] });
  } catch (error) {
    console.error('Update warehouse error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete warehouse
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if warehouse has stock
    const stockCheck = await db.query('SELECT COUNT(*) FROM stock WHERE warehouse_id = $1', [id]);
    if (parseInt(stockCheck.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete warehouse with existing stock' });
    }

    const result = await db.query('DELETE FROM warehouses WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Warehouse not found' });
    }

    res.json({ message: 'Warehouse deleted successfully' });
  } catch (error) {
    console.error('Delete warehouse error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

