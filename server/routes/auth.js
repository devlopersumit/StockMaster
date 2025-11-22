import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';
import nodemailer from 'nodemailer';
import upload from '../middleware/upload.js';
import { authenticateToken } from '../middleware/auth.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Email transporter (configure based on your email service)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Sign up
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    // Check if user exists
    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const result = await db.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email, role, profile_picture',
      [name, email, hashedPassword]
    );

    const user = result.rows[0];

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    // Prepare user response with profile picture URL
    const userResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      profile_picture: user.profile_picture ? `/api/uploads/profile-pictures/${path.basename(user.profile_picture)}` : null,
    };

    res.status(201).json({
      message: 'User created successfully',
      user: userResponse,
      token,
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    // Convert profile picture path to URL if exists
    let profilePictureUrl = null;
    if (user.profile_picture) {
      profilePictureUrl = `/api/uploads/profile-pictures/${path.basename(user.profile_picture)}`;
    }

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        profile_picture: profilePictureUrl,
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Request OTP for password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find user
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      // Don't reveal if email exists for security
      return res.json({ message: 'If the email exists, an OTP has been sent' });
    }

    const user = result.rows[0];

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Save OTP to database
    await db.query(
      'UPDATE users SET otp_code = $1, otp_expires = $2 WHERE id = $3',
      [otpCode, otpExpires, user.id]
    );

    // Send OTP via email (if configured)
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: email,
          subject: 'Password Reset OTP - StockMaster',
          text: `Your OTP for password reset is: ${otpCode}. It expires in 15 minutes.`,
          html: `<p>Your OTP for password reset is: <strong>${otpCode}</strong></p><p>It expires in 15 minutes.</p>`,
        });
        console.log(`OTP email sent to ${email}`);
      } catch (emailError) {
        console.error('Email sending error:', emailError);
        // Continue even if email fails (for development)
      }
    } else {
      // Development mode: Log OTP to console
      console.log('='.repeat(50));
      console.log('🔐 PASSWORD RESET OTP (Development Mode)');
      console.log('='.repeat(50));
      console.log(`Email: ${email}`);
      console.log(`OTP Code: ${otpCode}`);
      console.log(`Expires: ${otpExpires.toLocaleString()}`);
      console.log('='.repeat(50));
      console.log('⚠️  NOTE: In production, configure SMTP settings in .env file');
      console.log('='.repeat(50));
    }

    res.json({ message: 'If the email exists, an OTP has been sent' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset password with OTP
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Email, OTP, and new password are required' });
    }

    // Find user
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Check OTP
    if (!user.otp_code || user.otp_code !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    // Check if OTP expired
    if (new Date() > new Date(user.otp_expires)) {
      return res.status(400).json({ error: 'OTP has expired' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear OTP
    await db.query(
      'UPDATE users SET password = $1, otp_code = NULL, otp_expires = NULL WHERE id = $2',
      [hashedPassword, user.id]
    );

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const result = await db.query('SELECT id, name, email, role, profile_picture FROM users WHERE id = $1', [decoded.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    // Convert profile picture path to URL
    if (user.profile_picture) {
      user.profile_picture = `/api/uploads/profile-pictures/${path.basename(user.profile_picture)}`;
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// Upload profile picture
router.post('/profile-picture', authenticateToken, upload.single('profilePicture'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    
    // Delete old profile picture if exists
    const userResult = await db.query('SELECT profile_picture FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows.length > 0 && userResult.rows[0].profile_picture) {
      const oldFilePath = path.join(__dirname, '../uploads/profile-pictures', path.basename(userResult.rows[0].profile_picture));
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }

    // Update user profile picture in database
    await db.query(
      'UPDATE users SET profile_picture = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [filePath, req.user.id]
    );

    const profilePictureUrl = `/api/uploads/profile-pictures/${path.basename(filePath)}`;
    
    res.json({
      message: 'Profile picture uploaded successfully',
      profilePicture: profilePictureUrl,
    });
  } catch (error) {
    console.error('Upload profile picture error:', error);
    
    // Delete uploaded file if database update failed
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'Failed to upload profile picture' });
  }
});

export default router;

