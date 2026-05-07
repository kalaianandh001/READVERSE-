/**
 * src/models/User.js
 * Mongoose schema for registered READVERSE users.
 */

'use strict';

const { Schema, model } = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new Schema({

  name    : { type: String, required: true, maxlength: 80 },
  email   : { type: String, required: true, unique: true, lowercase: true, index: true },
  password: { type: String, required: true, select: false }, // never returned by default

  // ── Preferences ────────────────────────────────────────────
  interests: [{
    type   : String,
    // e.g. ['Technology', 'Sports', 'Tamil Nadu']
  }],
  language: { type: String, default: 'en' },   // 'en' | 'ta'
  darkMode: { type: Boolean, default: false },

  // ── Saved bookmarks ────────────────────────────────────────
  bookmarks: [{ type: Schema.Types.ObjectId, ref: 'Article' }],

  // ── Push notification subscription ─────────────────────────
  pushSubscription: { type: Object, default: null },

  // ── Admin flag ─────────────────────────────────────────────
  isAdmin: { type: Boolean, default: false },

  // ── Digest settings ────────────────────────────────────────
  digestEnabled: { type: Boolean, default: false },
  digestEmail  : { type: String, default: '' },

  lastLogin: { type: Date },

}, { timestamps: true });

// ── Hash password before saving ────────────────────────────────
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ── Method: compare plain password with stored hash ────────────
UserSchema.methods.comparePassword = async function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = model('User', UserSchema);
