import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../config/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (token && storedUser) {
      setUser(JSON.parse(storedUser));
      // Verify token is still valid
      api.get('/auth/me')
        .then((response) => {
          const userData = response.data.user;
          // Convert profile picture path to full URL if it exists
          if (userData.profile_picture && !userData.profile_picture.startsWith('http')) {
            const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
            userData.profile_picture = baseUrl.replace('/api', '') + userData.profile_picture;
          }
          setUser(userData);
          localStorage.setItem('user', JSON.stringify(userData));
        })
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      const { user, token } = response.data;
      
      // Convert profile picture path to full URL if it exists
      const userData = { ...user };
      if (userData.profile_picture && !userData.profile_picture.startsWith('http')) {
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
        userData.profile_picture = baseUrl.replace('/api', '') + userData.profile_picture;
      }
      
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Login failed',
      };
    }
  };

  const signup = async (name, email, password) => {
    try {
      const response = await api.post('/auth/signup', { name, email, password });
      const { user, token } = response.data;
      
      // Convert profile picture path to full URL if it exists
      const userData = { ...user };
      if (userData.profile_picture && !userData.profile_picture.startsWith('http')) {
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
        userData.profile_picture = baseUrl.replace('/api', '') + userData.profile_picture;
      }
      
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Signup failed',
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const updateUser = (updatedUser) => {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  const refreshUser = async () => {
    try {
      const response = await api.get('/auth/me');
      const userData = response.data.user;
      // Convert profile picture path to full URL if it exists
      if (userData.profile_picture && !userData.profile_picture.startsWith('http')) {
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
        userData.profile_picture = baseUrl.replace('/api', '') + userData.profile_picture;
      }
      updateUser(userData);
      return userData;
    } catch (error) {
      console.error('Failed to refresh user:', error);
      return null;
    }
  };

  const value = {
    user,
    login,
    signup,
    logout,
    updateUser,
    refreshUser,
    loading,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

