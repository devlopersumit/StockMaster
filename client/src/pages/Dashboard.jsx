import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../config/api';

const Dashboard = () => {
  const [kpis, setKpis] = useState({
    totalProducts: 0,
    lowStockItems: 0,
    outOfStockItems: 0,
    pendingReceipts: 0,
    pendingDeliveries: 0,
    pendingTransfers: 0,
  });
  const [recentActivities, setRecentActivities] = useState([]);
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [filters, setFilters] = useState({
    warehouse_id: '',
    document_type: '',
    status: '',
  });
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWarehouses();
    fetchDashboardData();
  }, [filters]);

  const fetchWarehouses = async () => {
    try {
      const response = await api.get('/warehouses');
      setWarehouses(response.data.warehouses);
    } catch (error) {
      console.error('Error fetching warehouses:', error);
    }
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.warehouse_id) params.warehouse_id = filters.warehouse_id;

      const [kpisResponse, activitiesResponse, lowStockResponse] = await Promise.all([
        api.get('/dashboard/kpis', { params }),
        api.get('/dashboard/recent-activities', { params: { limit: 10 } }),
        api.get('/dashboard/low-stock', { params }),
      ]);

      setKpis(kpisResponse.data);
      setRecentActivities(activitiesResponse.data.activities);
      setLowStockProducts(lowStockResponse.data.products);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const kpiCards = [
    {
      title: 'Total Products',
      value: kpis.totalProducts,
      icon: '📦',
      color: 'bg-blue-500',
      link: '/products',
    },
    {
      title: 'Low Stock Items',
      value: kpis.lowStockItems,
      icon: '⚠️',
      color: 'bg-yellow-500',
      link: '/products',
    },
    {
      title: 'Out of Stock',
      value: kpis.outOfStockItems,
      icon: '❌',
      color: 'bg-red-500',
      link: '/products',
    },
    {
      title: 'Pending Receipts',
      value: kpis.pendingReceipts,
      icon: '📥',
      color: 'bg-green-500',
      link: '/receipts',
    },
    {
      title: 'Pending Deliveries',
      value: kpis.pendingDeliveries,
      icon: '📤',
      color: 'bg-purple-500',
      link: '/deliveries',
    },
    {
      title: 'Pending Transfers',
      value: kpis.pendingTransfers,
      icon: '🔄',
      color: 'bg-indigo-500',
      link: '/transfers',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Warehouse</label>
            <select
              value={filters.warehouse_id}
              onChange={(e) => setFilters({ ...filters, warehouse_id: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Warehouses</option>
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {kpiCards.map((kpi, index) => (
          <Link
            key={index}
            to={kpi.link}
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">{kpi.title}</p>
                <p className="text-3xl font-bold text-gray-800 mt-2">{kpi.value}</p>
              </div>
              <div className={`${kpi.color} w-16 h-16 rounded-lg flex items-center justify-center text-3xl`}>
                {kpi.icon}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Products */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Low Stock Products</h2>
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : lowStockProducts.length > 0 ? (
            <div className="space-y-3">
              {lowStockProducts.slice(0, 5).map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-800">{product.name}</p>
                    <p className="text-sm text-gray-600">
                      {product.warehouse_name} - Stock: {product.stock_quantity} {product.unit_of_measure}
                    </p>
                  </div>
                  <span className="text-yellow-600 font-bold">⚠️</span>
                </div>
              ))}
              {lowStockProducts.length > 5 && (
                <Link
                  to="/products"
                  className="block text-center text-blue-600 hover:text-blue-800 mt-4"
                >
                  View All ({lowStockProducts.length})
                </Link>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No low stock products</p>
          )}
        </div>

        {/* Recent Activities */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Recent Activities</h2>
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : recentActivities.length > 0 ? (
            <div className="space-y-3">
              {recentActivities.map((activity) => (
                <div key={activity.id} className="border-l-4 border-blue-500 pl-4 py-2">
                  <p className="font-medium text-gray-800">{activity.product_name}</p>
                  <p className="text-sm text-gray-600">
                    {activity.movement_type === 'in' ? '📥' : '📤'}{' '}
                    {Math.abs(activity.quantity_change)} {activity.product_name} -{' '}
                    {activity.warehouse_name}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(activity.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
              <Link
                to="/history"
                className="block text-center text-blue-600 hover:text-blue-800 mt-4"
              >
                View All History
              </Link>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No recent activities</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

