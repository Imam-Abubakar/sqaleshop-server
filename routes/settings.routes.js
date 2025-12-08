const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { validateStoreAccess, validateStore, validatePermission } = require('../middleware/store.middleware');
const settingsController = require('../controllers/settings.controller');

// Get all settings
router.get('/', authenticate, validateStoreAccess, settingsController.getStoreSettings);

// Section 1: Profile
router.patch('/profile', authenticate, validateStoreAccess, settingsController.updateProfile);
router.post('/profile/verify-email', authenticate, validateStoreAccess, settingsController.verifyEmailChange);
router.post('/profile/resend-verification', authenticate, validateStoreAccess, settingsController.resendEmailVerification);
router.post('/profile/cancel-email-change', authenticate, validateStoreAccess, settingsController.cancelEmailChange);

// Section 2: Store Details - requires settings permission
router.patch('/store-details', authenticate, validateStoreAccess, settingsController.updateStoreDetails);

// Section 3: Checkout Options - requires settings permission
router.patch('/checkout-options', authenticate, validateStoreAccess, settingsController.updateCheckoutOptions);

// Section 4: Store Customization - requires settings permission
router.patch('/customization', authenticate, validateStoreAccess, settingsController.updateStoreCustomization);

// Section 5: Store Managers - owner only
router.get('/managers', authenticate, validateStoreAccess, settingsController.getStoreManagers);
router.post('/managers/invite', authenticate, validateStoreAccess, settingsController.inviteStoreManager);
router.delete('/managers/:managerId', authenticate, validateStoreAccess, settingsController.removeStoreManager);
router.patch('/managers/:managerId/permissions', authenticate, validateStoreAccess, settingsController.updateManagerPermissions);

// Section 6: Booking Settings - requires settings permission
router.patch('/booking-settings', authenticate, validateStoreAccess, settingsController.updateBookingSettings);

// Section 7: Premium Domain - Growth plan only
router.post('/premium-domain', authenticate, validateStoreAccess, settingsController.requestPremiumDomain);

module.exports = router; 