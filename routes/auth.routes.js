const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  requestMagicLink,
  verifyMagicLink,
  getMe,
  logout,
  updateProfile,
  completeOnboarding
} = require('../controllers/auth.controller');

router.post('/magic-link', requestMagicLink);
router.post('/verify', verifyMagicLink);
router.get('/me', authenticate, getMe);
router.post('/logout', authenticate, logout);
router.put('/profile', authenticate, updateProfile);
router.post('/complete-onboarding', authenticate, completeOnboarding);

module.exports = router;