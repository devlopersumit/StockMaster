import React from 'react';
import { useAuth } from '../context/AuthContext';

const Profile = () => {
  const { user } = useAuth();

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">My Profile</h1>

        <div className="space-y-6">
          <div className="flex items-center justify-center mb-8">
            <div className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center text-white text-4xl font-bold">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
              <div className="px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-900">
                {user?.name || 'N/A'}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <div className="px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-900">
                {user?.email || 'N/A'}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
              <div className="px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 capitalize">
                {user?.role || 'Staff'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;

