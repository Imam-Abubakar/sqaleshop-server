const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  name: String,
  whatsappNumber: String,
  role: {
    type: String,
    enum: ['admin', 'owner', 'customer', 'manager', 'superadmin'],
    default: 'owner',
  },
  plan: {
    type: String,
    enum: ['free', 'growth'],
    default: 'free',
  },
  magicLink: {
    code: String,
    expiresAt: Date,
  },
  // Email verification for email change
  emailVerification: {
    newEmail: String,
    otp: String,
    expiresAt: Date,
  },
  onboardingStatus: {
    type: String,
    enum: ['pending', 'business_info', 'template_selection', 'domain_setup', 'completed'],
    default: 'pending'
  },
  lastLoginAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

userSchema.methods.createMagicCode = function() {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  this.magicLink = {
    code,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
  };
  return code;
};

userSchema.methods.verifyMagicCode = function(code) {
  return (
    this.magicLink &&
    this.magicLink.code === code &&
    this.magicLink.expiresAt > new Date()
  );
};

// Generate OTP for email verification
userSchema.methods.createEmailVerificationOTP = function(newEmail) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.emailVerification = {
    newEmail,
    otp,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
  };
  return otp;
};

// Verify OTP and update email if valid
userSchema.methods.verifyEmailOTP = function(otp) {
  const isValid = 
    this.emailVerification &&
    this.emailVerification.otp === otp &&
    this.emailVerification.expiresAt > new Date();
  
  if (isValid && this.emailVerification.newEmail) {
    this.email = this.emailVerification.newEmail;
    this.emailVerification = undefined;
  }
  
  return isValid;
};

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - email
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: User's email address
 *         name:
 *           type: string
 *           description: User's full name
 *         password:
 *           type: string
 *           description: Hashed password (not returned in responses)
 *         role:
 *           type: string
 *           enum: [user, admin]
 *           default: user
 *           description: User's role in the system
 *         plan:
 *           type: string
 *           enum: [free, growth]
 *           default: free
 *           description: Subscription plan assigned to the user
 *         isEmailVerified:
 *           type: boolean
 *           default: false
 *           description: Whether email has been verified
 *         lastLoginAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp of last login
 *         status:
 *           type: string
 *           enum: [active, inactive, suspended]
 *           default: active
 *           description: Current user status
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

module.exports = mongoose.model('User', userSchema); 