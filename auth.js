/**
 * src/routes/auth.js
 * POST /api/auth/signup
 * POST /api/auth/login
 * GET  /api/auth/me        (requires token)
 * PUT  /api/auth/preferences
 */

'use strict';

const express   = require('express');
const jwt       = require('jsonwebtoken');
const validator = require('validator');
const User      = require('../models/User');
const { requireAuth } = require('../middleware/requireAuth');

const authRouter = express.Router();
const JWT_SECRET  = process.env.JWT_SECRET || 'changeme_in_production';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

function signToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

// ── POST /api/auth/signup ─────────────────────────────────────
authRouter.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ error: 'Name, email and password are required.' });

    if (!validator.isEmail(email))
      return res.status(400).json({ error: 'Invalid email address.' });

    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ error: 'Email already registered.' });

    const user = await User.create({ name, email, password });
    const token = signToken(user._id);

    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, interests: user.interests },
    });
  } catch (err) {
    console.error('[AUTH] signup error:', err);
    res.status(500).json({ error: 'Signup failed. Please try again.' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────
authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: 'Email and password required.' });

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials.' });

    user.lastLogin = new Date();
    await user.save();

    const token = signToken(user._id);
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, interests: user.interests, darkMode: user.darkMode, language: user.language },
    });
  } catch (err) {
    console.error('[AUTH] login error:', err);
    res.status(500).json({ error: 'Login failed.' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────
authRouter.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch profile.' });
  }
});

// ── PUT /api/auth/preferences ─────────────────────────────────
authRouter.put('/preferences', requireAuth, async (req, res) => {
  try {
    const { interests, language, darkMode, digestEnabled, digestEmail } = req.body;
    const update = {};
    if (Array.isArray(interests))   update.interests     = interests;
    if (language)                   update.language      = language;
    if (darkMode !== undefined)     update.darkMode      = darkMode;
    if (digestEnabled !== undefined) update.digestEnabled = digestEnabled;
    if (digestEmail)                update.digestEmail   = digestEmail;

    const user = await User.findByIdAndUpdate(req.userId, update, { new: true }).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Could not update preferences.' });
  }
});

module.exports = { authRouter };
