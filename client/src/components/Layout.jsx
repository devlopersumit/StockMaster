import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Layout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const menuItems = [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/products', label: 'Products', icon: '📦' },
    { path: '/receipts', label: 'Receipts', icon: '📥' },
    { path: '/deliveries', label: 'Deliveries', icon: '📤' },
    { path: '/transfers', label: 'Transfers', icon: '🔄' },
    { path: '/adjustments', label: 'Adjustments', icon: '⚖️' },
    { path: '/history', label: 'Move History', icon: '📜' },
    { path: '/settings', label: 'Settings', icon: '⚙️' },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-blue-900 text-white transition-all duration-300 flex flex-col`}
      >
        <div className="p-4 flex items-center justify-between border-b border-blue-800">
          <h1 className={`font-bold text-xl ${!sidebarOpen && 'hidden'}`}>StockMaster</h1>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-blue-800 rounded"
          >
            {sidebarOpen ? '←' : '→'}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-4">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 p-3 rounded-lg mb-2 transition-colors ${
                location.pathname === item.path
                  ? 'bg-blue-800 text-white'
                  : 'hover:bg-blue-800 text-gray-200'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        {/* Profile Section */}
        <div className="border-t border-blue-800 p-4">
          <Link
            to="/profile"
            className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
              location.pathname === '/profile'
                ? 'bg-blue-800 text-white'
                : 'hover:bg-blue-800 text-gray-200'
            }`}
          >
            <span className="text-xl">👤</span>
            {sidebarOpen && (
              <>
                <div className="flex-1">
                  <div className="font-semibold">{user?.name || 'User'}</div>
                  <div className="text-xs text-gray-300">{user?.email}</div>
                </div>
              </>
            )}
          </Link>
          {sidebarOpen && (
            <button
              onClick={handleLogout}
              className="w-full mt-2 p-2 bg-red-600 hover:bg-red-700 rounded-lg text-white text-sm"
            >
              Logout
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;

