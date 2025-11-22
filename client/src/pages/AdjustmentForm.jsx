import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../config/api';

const AdjustmentForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [formData, setFormData] = useState({
    warehouse_id: '',
    reason: '',
    status: 'draft',
  });
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState({ product_id: '', physical_quantity: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchWarehouses();
    fetchProducts();
    if (isEdit) {
      fetchAdjustment();
    }
  }, [id]);

  const fetchWarehouses = async () => {
    try {
      const response = await api.get('/warehouses');
      setWarehouses(response.data.warehouses);
    } catch (error) {
      console.error('Error fetching warehouses:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await api.get('/products');
      setProducts(response.data.products);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchAdjustment = async () => {
    try {
      const response = await api.get(`/adjustments/${id}`);
      const adjustment = response.data.adjustment;
      setFormData({
        warehouse_id: adjustment.warehouse_id,
        reason: adjustment.reason || '',
        status: adjustment.status,
      });
      setItems(adjustment.items || []);
    } catch (error) {
      console.error('Error fetching adjustment:', error);
      setError('Failed to load adjustment');
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const fetchStockForProduct = async (productId, warehouseId) => {
    try {
      const response = await api.get(`/products/${productId}`, {
        params: { warehouse_id: warehouseId },
      });
      const stock = response.data.product.stock?.find((s) => s.warehouse_id === parseInt(warehouseId));
      return stock?.quantity || 0;
    } catch (error) {
      return 0;
    }
  };

  const handleAddItem = async () => {
    if (!selectedProduct.product_id || !formData.warehouse_id) {
      alert('Please select a warehouse and product');
      return;
    }

    const recordedQuantity = await fetchStockForProduct(
      selectedProduct.product_id,
      formData.warehouse_id
    );
    const physicalQuantity = parseInt(selectedProduct.physical_quantity) || 0;
    const difference = physicalQuantity - recordedQuantity;

    const product = products.find((p) => p.id === parseInt(selectedProduct.product_id));
    setItems([
      ...items,
      {
        product_id: parseInt(selectedProduct.product_id),
        product_name: product?.name,
        sku: product?.sku,
        recorded_quantity: recordedQuantity,
        physical_quantity: physicalQuantity,
        difference: difference,
      },
    ]);
    setSelectedProduct({ product_id: '', physical_quantity: 0 });
  };

  const handleRemoveItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.warehouse_id) {
      setError('Please select a warehouse');
      return;
    }

    if (items.length === 0) {
      setError('Please add at least one item');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        ...formData,
        items: items.map((item) => ({
          product_id: item.product_id,
          physical_quantity: item.physical_quantity,
        })),
      };

      if (isEdit) {
        await api.put(`/adjustments/${id}`, payload);
      } else {
        await api.post('/adjustments', payload);
      }
      navigate('/adjustments');
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to save adjustment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">
          {isEdit ? 'Edit Adjustment' : 'Create New Adjustment'}
        </h1>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Warehouse *</label>
            <select
              name="warehouse_id"
              value={formData.warehouse_id}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Warehouse</option>
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name}
                </option>
              ))}
            </select>
          </div>

          {isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="draft">Draft</option>
                <option value="waiting">Waiting</option>
                <option value="ready">Ready</option>
                <option value="done">Done</option>
                <option value="canceled">Canceled</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Reason</label>
            <textarea
              name="reason"
              value={formData.reason}
              onChange={handleChange}
              rows="3"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Reason for adjustment"
            />
          </div>

          <div className="border-t pt-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Items</h2>

            {formData.warehouse_id && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Product</label>
                  <select
                    value={selectedProduct.product_id}
                    onChange={(e) =>
                      setSelectedProduct({ ...selectedProduct, product_id: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.sku} - {product.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Physical Count
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={selectedProduct.physical_quantity}
                      onChange={(e) =>
                        setSelectedProduct({ ...selectedProduct, physical_quantity: e.target.value })
                      }
                      min="0"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}

            {items.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Product
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Recorded
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Physical
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Difference
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {items.map((item, index) => (
                      <tr key={index}>
                        <td className="px-4 py-2 text-sm text-gray-900">
                          {item.product_name || item.sku}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500">{item.recorded_quantity}</td>
                        <td className="px-4 py-2 text-sm text-gray-500">{item.physical_quantity}</td>
                        <td className="px-4 py-2 text-sm">
                          <span
                            className={`font-medium ${
                              item.difference > 0
                                ? 'text-green-600'
                                : item.difference < 0
                                ? 'text-red-600'
                                : 'text-gray-600'
                            }`}
                          >
                            {item.difference > 0 ? '+' : ''}
                            {item.difference}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(index)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : isEdit ? 'Update Adjustment' : 'Create Adjustment'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/adjustments')}
              className="bg-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdjustmentForm;

