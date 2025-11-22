import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import warehouseRoutes from './routes/warehouses.js';
import receiptRoutes from './routes/receipts.js';
import deliveryRoutes from './routes/deliveries.js';
import transferRoutes from './routes/transfers.js';
import adjustmentRoutes from './routes/adjustments.js';
import dashboardRoutes from './routes/dashboard.js';
import historyRoutes from './routes/history.js';
import { authenticateToken } from './middleware/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files (profile pictures)
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'StockMaster API is running' });
});

// Public routes
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/products', authenticateToken, productRoutes);
app.use('/api/warehouses', authenticateToken, warehouseRoutes);
app.use('/api/receipts', authenticateToken, receiptRoutes);
app.use('/api/deliveries', authenticateToken, deliveryRoutes);
app.use('/api/transfers', authenticateToken, transferRoutes);
app.use('/api/adjustments', authenticateToken, adjustmentRoutes);
app.use('/api/dashboard', authenticateToken, dashboardRoutes);
app.use('/api/history', authenticateToken, historyRoutes);

// Initialize database tables
db.init();

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

