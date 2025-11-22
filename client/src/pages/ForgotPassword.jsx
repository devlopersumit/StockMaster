import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../config/api';
import { validatePassword, getPasswordStrength } from '../utils/passwordValidation';

const ForgotPassword = () => {
  const [step, setStep] = useState(1); // 1: email, 2: OTP + new password
  const [formData, setFormData] = useState({
    email: '',
    otp: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [passwordErrors, setPasswordErrors] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const passwordStrength = getPasswordStrength(formData.newPassword);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
    setError('');
    setMessage('');

    // Validate password in real-time
    if (name === 'newPassword') {
      const validation = validatePassword(value);
      setPasswordErrors(validation.errors);
    } else if (name === 'confirmPassword') {
      setPasswordErrors([]);
    }
  };

  const handleRequestOTP = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      await api.post('/auth/forgot-password', { email: formData.email });
      setMessage('If the email exists, an OTP has been sent to your email address.');
      setStep(2);
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to send OTP');
    }

    setLoading(false);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setPasswordErrors([]);

    // Validate password strength
    const passwordValidation = validatePassword(formData.newPassword);
    if (!passwordValidation.isValid) {
      setPasswordErrors(passwordValidation.errors);
      setError('Please fix password requirements');
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      await api.post('/auth/reset-password', {
        email: formData.email,
        otp: formData.otp,
        newPassword: formData.newPassword,
      });
      setMessage('Password reset successfully! You can now login with your new password.');
      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to reset password');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Reset Password</h1>
          <p className="text-gray-600">
            {step === 1
              ? 'Enter your email to receive an OTP'
              : 'Enter the OTP and your new password'}
          </p>
        </div>

        {step === 1 ? (
          <form onSubmit={handleRequestOTP} className="space-y-6">
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {message && (
              <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
                {message}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your email"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Sending OTP...' : 'Send OTP'}
            </button>

            <div className="text-center text-sm text-gray-600">
              <Link to="/login" className="text-blue-600 hover:text-blue-800 font-medium">
                Back to Login
              </Link>
            </div>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-6">
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {message && (
              <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
                {message}
              </div>
            )}

            <div>
              <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-2">
                OTP Code
              </label>
              <input
                type="text"
                id="otp"
                name="otp"
                value={formData.otp}
                onChange={handleChange}
                required
                maxLength="6"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter 6-digit OTP"
              />
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
                New Password *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="newPassword"
                  name="newPassword"
                  value={formData.newPassword}
                  onChange={handleChange}
                  required
                  className={`w-full px-4 py-2 pr-10 border ${
                    passwordErrors.length > 0 && formData.newPassword
                      ? 'border-red-300'
                      : 'border-gray-300'
                  } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder="Enter new password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>

              {/* Password Strength Indicator */}
              {formData.newPassword && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${passwordStrength.color}`}
                        style={{ width: `${(passwordStrength.strength / 5) * 100}%` }}
                      ></div>
                    </div>
                    <span className="text-xs font-medium text-gray-600">{passwordStrength.label}</span>
                  </div>
                </div>
              )}

              {/* Password Requirements */}
              {formData.newPassword && passwordErrors.length > 0 && (
                <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs font-semibold text-red-800 mb-2">Password must contain:</p>
                  <ul className="text-xs text-red-700 space-y-1">
                    <li className={formData.newPassword.length >= 8 ? 'text-green-600' : ''}>
                      {formData.newPassword.length >= 8 ? '✓' : '✗'} At least 8 characters
                    </li>
                    <li className={/[A-Z]/.test(formData.newPassword) ? 'text-green-600' : ''}>
                      {/[A-Z]/.test(formData.newPassword) ? '✓' : '✗'} One uppercase letter (A-Z)
                    </li>
                    <li className={/[a-z]/.test(formData.newPassword) ? 'text-green-600' : ''}>
                      {/[a-z]/.test(formData.newPassword) ? '✓' : '✗'} One lowercase letter (a-z)
                    </li>
                    <li className={/[0-9]/.test(formData.newPassword) ? 'text-green-600' : ''}>
                      {/[0-9]/.test(formData.newPassword) ? '✓' : '✗'} One number (0-9)
                    </li>
                    <li className={/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(formData.newPassword) ? 'text-green-600' : ''}>
                      {/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(formData.newPassword) ? '✓' : '✗'} One special character (!@#$%^&*...)
                    </li>
                  </ul>
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Confirm New Password *
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  id="confirmPassword"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                  className={`w-full px-4 py-2 pr-10 border ${
                    formData.confirmPassword &&
                    formData.newPassword !== formData.confirmPassword
                      ? 'border-red-300'
                      : 'border-gray-300'
                  } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder="Confirm new password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
              {formData.confirmPassword && formData.newPassword !== formData.confirmPassword && (
                <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
              )}
              {formData.confirmPassword &&
                formData.newPassword === formData.confirmPassword &&
                formData.newPassword && (
                  <p className="mt-1 text-xs text-green-600">✓ Passwords match</p>
                )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Resetting password...' : 'Reset Password'}
            </button>

            <div className="text-center text-sm text-gray-600">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                Back
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;

