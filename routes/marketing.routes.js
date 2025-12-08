const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth.middleware');
const {
  getAllCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  sendCampaign,
  getCampaignAnalytics,
  getCampaignsAnalytics
} = require('../controllers/marketing.controller');

// All routes require superadmin access
router.use(protect);
router.use(restrictTo('superadmin'));

router.get('/', getAllCampaigns);
router.get('/analytics', getCampaignsAnalytics);
router.get('/:id', getCampaignById);
router.get('/:id/analytics', getCampaignAnalytics);
router.post('/', createCampaign);
router.put('/:id', updateCampaign);
router.delete('/:id', deleteCampaign);
router.post('/:id/send', sendCampaign);

module.exports = router;
