import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection
pool.on('connect', () => {
  console.log('Database connected successfully');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Initialize database tables
const init = async () => {
  try {
    const client = await pool.connect();
    
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'Staff',
        profile_picture VARCHAR(500),
        otp_code VARCHAR(6),
        otp_expires TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Warehouses table
    await client.query(`
      CREATE TABLE IF NOT EXISTS warehouses (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50) UNIQUE NOT NULL,
        location VARCHAR(255),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Product categories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Products table
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        sku VARCHAR(100) UNIQUE NOT NULL,
        category_id INTEGER REFERENCES categories(id),
        unit_of_measure VARCHAR(50) NOT NULL,
        reorder_level INTEGER DEFAULT 0,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Stock table (stores current stock per product per warehouse)
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 0,
        UNIQUE(product_id, warehouse_id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Receipts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS receipts (
        id SERIAL PRIMARY KEY,
        receipt_number VARCHAR(100) UNIQUE NOT NULL,
        supplier VARCHAR(255),
        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
        status VARCHAR(50) DEFAULT 'draft',
        user_id INTEGER NOT NULL REFERENCES users(id),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Receipt items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS receipt_items (
        id SERIAL PRIMARY KEY,
        receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity INTEGER NOT NULL,
        unit_price DECIMAL(10, 2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Delivery orders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS deliveries (
        id SERIAL PRIMARY KEY,
        delivery_number VARCHAR(100) UNIQUE NOT NULL,
        customer VARCHAR(255),
        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
        status VARCHAR(50) DEFAULT 'draft',
        user_id INTEGER NOT NULL REFERENCES users(id),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Delivery items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS delivery_items (
        id SERIAL PRIMARY KEY,
        delivery_id INTEGER NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Internal transfers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS transfers (
        id SERIAL PRIMARY KEY,
        transfer_number VARCHAR(100) UNIQUE NOT NULL,
        from_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
        to_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
        status VARCHAR(50) DEFAULT 'draft',
        user_id INTEGER NOT NULL REFERENCES users(id),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Transfer items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS transfer_items (
        id SERIAL PRIMARY KEY,
        transfer_id INTEGER NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Stock adjustments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS adjustments (
        id SERIAL PRIMARY KEY,
        adjustment_number VARCHAR(100) UNIQUE NOT NULL,
        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
        status VARCHAR(50) DEFAULT 'draft',
        user_id INTEGER NOT NULL REFERENCES users(id),
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Adjustment items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS adjustment_items (
        id SERIAL PRIMARY KEY,
        adjustment_id INTEGER NOT NULL REFERENCES adjustments(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id),
        recorded_quantity INTEGER NOT NULL,
        physical_quantity INTEGER NOT NULL,
        difference INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Stock ledger (movement history)
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_ledger (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id),
        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
        movement_type VARCHAR(50) NOT NULL,
        reference_type VARCHAR(50) NOT NULL,
        reference_id INTEGER NOT NULL,
        quantity_change INTEGER NOT NULL,
        quantity_after INTEGER NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    await client.query(`CREATE INDEX IF NOT EXISTS idx_stock_product_warehouse ON stock(product_id, warehouse_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_stock_ledger_product ON stock_ledger(product_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_stock_ledger_warehouse ON stock_ledger(warehouse_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_stock_ledger_created_at ON stock_ledger(created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);

    // Insert default warehouse if none exists
    const warehouseResult = await client.query('SELECT COUNT(*) FROM warehouses');
    if (parseInt(warehouseResult.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO warehouses (name, code, location) 
        VALUES ('Main Warehouse', 'WH-001', 'Default Location')
      `);
    }

    // Insert default category if none exists
    const categoryResult = await client.query('SELECT COUNT(*) FROM categories');
    if (parseInt(categoryResult.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO categories (name, description) 
        VALUES ('General', 'General category for products')
      `);
    }

    client.release();
    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
};

export default {
  query: (text, params) => pool.query(text, params),
  pool,
  init
};

