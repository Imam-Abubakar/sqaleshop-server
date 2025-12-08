const express = require('express');
const router = express.Router();
const { getStoreByUrl, getStoreCheckoutOptions } = require('../controllers/store.controller');

/**
 * @swagger
 * /api/public/stores/{url}:
 *   get:
 *     summary: Get public store by URL
 *     tags: [Public]
 *     parameters:
 *       - in: path
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Store details retrieved successfully
 *       404:
 *         description: Store not found
 */
router.get('/stores/:url', getStoreByUrl);

// Public: checkout options for storefront checkout page
router.get('/stores/:url/checkout-options', getStoreCheckoutOptions);

module.exports = router; 