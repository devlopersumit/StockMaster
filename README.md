# StockMaster - Inventory Management System

A comprehensive Inventory Management System built with PERN Stack (PostgreSQL, Express, React, Node.js) that digitizes and streamlines all stock-related operations within a business.

## Features

### Core Features
- **Product Management**: Create, update, and manage products with SKU, categories, units of measure, and reorder levels
- **Receipts (Incoming Stock)**: Manage incoming goods from suppliers with automatic stock updates
- **Delivery Orders (Outgoing Stock)**: Handle outgoing stock for customer shipments
- **Internal Transfers**: Move stock between warehouses/locations within the company
- **Stock Adjustments**: Fix mismatches between recorded and physical stock counts
- **Multi-Warehouse Support**: Manage stock across multiple warehouse locations
- **Stock Ledger**: Complete movement history tracking for all inventory transactions

### Dashboard
- Real-time KPIs (Total Products, Low Stock Items, Out of Stock Items, Pending Receipts/Deliveries/Transfers)
- Recent activities feed
- Low stock alerts
- Dynamic filters by warehouse, status, and document type

### Authentication
- User signup/login
- OTP-based password reset
- JWT token-based authentication
- Protected routes

## Technology Stack

### Backend
- Node.js with Express.js
- PostgreSQL database
- JWT for authentication
- bcryptjs for password hashing
- nodemailer for OTP emails

### Frontend
- React 19 with React Router
- Tailwind CSS for styling
- Axios for API calls
- Vite for build tooling

## Prerequisites

- Node.js (v16 or higher)
- PostgreSQL database
- npm or yarn package manager

## Installation

### 1. Clone the repository
```bash
git clone <repository-url>
cd StockMaster
```

### 2. Backend Setup

```bash
cd server
npm install
```

Create a `.env` file in the `server` directory:
```env
DATABASE_URL=your_postgresql_connection_string
JWT_SECRET=your-secret-key-change-this-in-production
PORT=5000
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-email-password
NODE_ENV=development
```

Start the backend server:
```bash
npm run dev
```

The server will run on `http://localhost:5000`

### 3. Frontend Setup

```bash
cd client
npm install
```

Create a `.env` file in the `client` directory (optional, as proxy is configured):
```env
VITE_API_URL=http://localhost:5000/api
```

Start the frontend development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:3000`

## Database Setup

The database tables will be automatically created when you first start the server. The initialization script creates:

- Users table
- Products table with categories
- Warehouses table
- Stock table (tracks stock per product per warehouse)
- Receipts and receipt items tables
- Deliveries and delivery items tables
- Transfers and transfer items tables
- Adjustments and adjustment items tables
- Stock ledger table (movement history)

A default warehouse and category will be created on first run.

## Usage

1. **Sign Up**: Create a new account at `/signup`
2. **Login**: Access the dashboard after login
3. **Create Products**: Navigate to Products and add your inventory items
4. **Set Up Warehouses**: Go to Settings to add warehouse locations
5. **Manage Stock**: 
   - Create receipts for incoming stock
   - Create deliveries for outgoing stock
   - Transfer stock between warehouses
   - Adjust stock when physical counts differ

## Project Structure

```
StockMaster/
├── server/
│   ├── config/
│   │   └── db.js              # Database connection and initialization
│   ├── middleware/
│   │   └── auth.js            # Authentication middleware
│   ├── routes/
│   │   ├── auth.js            # Authentication routes
│   │   ├── products.js        # Product routes
│   │   ├── warehouses.js      # Warehouse routes
│   │   ├── receipts.js        # Receipt routes
│   │   ├── deliveries.js      # Delivery routes
│   │   ├── transfers.js       # Transfer routes
│   │   ├── adjustments.js     # Adjustment routes
│   │   ├── dashboard.js       # Dashboard KPIs routes
│   │   └── history.js         # Stock ledger routes
│   ├── index.js               # Server entry point
│   └── package.json
├── client/
│   ├── src/
│   │   ├── components/        # Reusable components
│   │   ├── config/            # API configuration
│   │   ├── context/           # React context providers
│   │   ├── pages/             # Page components
│   │   ├── App.jsx            # Main app component
│   │   └── main.jsx           # Entry point
│   └── package.json
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/forgot-password` - Request OTP
- `POST /api/auth/reset-password` - Reset password with OTP
- `GET /api/auth/me` - Get current user

### Products
- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get single product
- `POST /api/products` - Create product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product

### Warehouses
- `GET /api/warehouses` - Get all warehouses
- `POST /api/warehouses` - Create warehouse
- `PUT /api/warehouses/:id` - Update warehouse
- `DELETE /api/warehouses/:id` - Delete warehouse

### Receipts
- `GET /api/receipts` - Get all receipts
- `GET /api/receipts/:id` - Get single receipt
- `POST /api/receipts` - Create receipt
- `PUT /api/receipts/:id` - Update receipt
- `DELETE /api/receipts/:id` - Delete receipt

### Deliveries
- `GET /api/deliveries` - Get all deliveries
- `GET /api/deliveries/:id` - Get single delivery
- `POST /api/deliveries` - Create delivery
- `PUT /api/deliveries/:id` - Update delivery
- `DELETE /api/deliveries/:id` - Delete delivery

### Transfers
- `GET /api/transfers` - Get all transfers
- `GET /api/transfers/:id` - Get single transfer
- `POST /api/transfers` - Create transfer
- `PUT /api/transfers/:id` - Update transfer
- `DELETE /api/transfers/:id` - Delete transfer

### Adjustments
- `GET /api/adjustments` - Get all adjustments
- `GET /api/adjustments/:id` - Get single adjustment
- `POST /api/adjustments` - Create adjustment
- `PUT /api/adjustments/:id` - Update adjustment
- `DELETE /api/adjustments/:id` - Delete adjustment

### Dashboard
- `GET /api/dashboard/kpis` - Get dashboard KPIs
- `GET /api/dashboard/recent-activities` - Get recent activities
- `GET /api/dashboard/low-stock` - Get low stock products

### History
- `GET /api/history/moves` - Get stock movement history

## Notes

- All API routes except `/api/auth/*` require authentication via JWT token
- Stock is automatically updated when receipts/deliveries/transfers/adjustments are marked as "done"
- The stock ledger logs all movements for audit purposes
- OTP emails require SMTP configuration in `.env`

## License

ISC

