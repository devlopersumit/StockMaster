import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../config/api';

const Profile = () => {
  const { user, setUser } = useAuth();
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(user?.profile_picture || null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef(null);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Please select a valid image file (JPEG, PNG, GIF, or WEBP)');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return;
    }

    setSelectedFile(file);
    setError('');
    setSuccess('');

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select an image file');
      return;
    }

    setUploading(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('profilePicture', selectedFile);

      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/auth/profile-picture`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload profile picture');
      }

      setSuccess('Profile picture uploaded successfully!');
      setSelectedFile(null);

      // Update user in context and localStorage
      const updatedUser = {
        ...user,
        profile_picture: data.profilePicture,
      };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));

      // Update preview to use the new URL
      setPreviewUrl(data.profilePicture);
    } catch (error) {
      setError(error.message || 'Failed to upload profile picture');
      // Reset preview to original
      setPreviewUrl(user?.profile_picture || null);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!user?.profile_picture) return;

    // This would require a backend endpoint to remove the picture
    // For now, just reset the preview
    setPreviewUrl(null);
    setSelectedFile(null);
    setError('');
  };

  const getInitials = () => {
    if (user?.name) {
      return user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return 'U';
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">My Profile</h1>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
            {success}
          </div>
        )}

        <div className="space-y-6">
          {/* Profile Picture Section */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative mb-4">
              {previewUrl ? (
                <img
                  src={previewUrl.startsWith('http') 
                    ? previewUrl
                    : previewUrl.startsWith('/api')
                    ? `http://localhost:5000${previewUrl}`
                    : previewUrl}
                  alt="Profile"
                  className="w-32 h-32 rounded-full object-cover border-4 border-blue-600"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    if (e.target.nextSibling) {
                      e.target.nextSibling.style.display = 'flex';
                    }
                  }}
                />
              ) : null}
              <div
                className={`w-32 h-32 rounded-full flex items-center justify-center text-white text-4xl font-bold border-4 border-blue-600 ${
                  previewUrl ? 'bg-blue-600 hidden' : 'bg-blue-600'
                }`}
              >
                {getInitials()}
              </div>
            </div>

            <div className="flex flex-col items-center gap-3">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                {previewUrl && !selectedFile ? 'Change Photo' : 'Upload Photo'}
              </button>
              {selectedFile && (
                <div className="flex gap-2">
                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {uploading ? 'Uploading...' : 'Save Photo'}
                  </button>
                  <button
                    onClick={() => {
                      setSelectedFile(null);
                      setPreviewUrl(user?.profile_picture || null);
                      setError('');
                    }}
                    disabled={uploading}
                    className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 disabled:opacity-50 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              )}
              {selectedFile && (
                <p className="text-xs text-gray-500 text-center">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              )}
            </div>
          </div>

          {/* Profile Information */}
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
