const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth.middleware');
const {
  getPlatformOverview,
  getUserAnalytics,
  getStoreAnalytics,
  getRevenueAnalytics,
  getAllUsers,
  getAllStores,
  updateUserPlan
} = require('../controllers/platform-analytics.controller');

// All routes require superadmin access
router.use(protect);
router.use(restrictTo('superadmin'));

router.get('/overview', getPlatformOverview);
router.get('/users', getUserAnalytics);
router.get('/users/all', getAllUsers);
router.patch('/users/:userId/plan', updateUserPlan);
router.get('/stores', getStoreAnalytics);
router.get('/stores/all', getAllStores);
router.get('/revenue', getRevenueAnalytics);

module.exports = router;
