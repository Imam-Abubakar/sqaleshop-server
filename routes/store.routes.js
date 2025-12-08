const express = require('express');
const router = express.Router();
const {
  getStorefront,
  getAvailableSlots,
  createStore,
  getStore,
  updateStore,
  getStoreByUrl,
  getUserStores,
  getStoreById,
  deleteStore
} = require('../controllers/store.controller');
const { authenticate } = require('../middleware/auth');

// Public store routes
router.get('/', getStorefront);
router.get('/availability', getAvailableSlots);

// Get all stores for current user (owned + managed)
router.get('/user', authenticate, getUserStores);

// Get a specific store by ID
router.get('/:storeId', authenticate, getStoreById);
router.patch('/:id', authenticate, updateStore);

/**
 * @swagger
 * /api/stores:
 *   post:
 *     summary: Create a new store
 *     tags: [Stores]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - subdomain
 *             properties:
 *               name:
 *                 type: string
 *               subdomain:
 *                 type: string
 *               description:
 *                 type: string
 *               logo:
 *                 type: string
 *               theme:
 *                 type: object
 *     responses:
 *       201:
 *         description: Store created successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Not authenticated
 */
router.post('/', authenticate, createStore);

/**
 * @swagger
 * /api/stores/{id}:
 *   get:
 *     summary: Get store by ID
 *     tags: [Stores]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Store details retrieved successfully
 *       404:
 *         description: Store not found
 *   
 *   patch:
 *     summary: Update store
 *     tags: [Stores]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               logo:
 *                 type: string
 *               theme:
 *                 type: object
 *     responses:
 *       200:
 *         description: Store updated successfully
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Store not found
 */
router.get('/:id', getStore);


/**
 * @swagger
 * /api/stores/url/{url}:
 *   get:
 *     summary: Get store by URL
 *     tags: [Stores]
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
router.get('/url/:url', getStoreByUrl);




// Update a store (owner only)
router.patch('/:storeId', authenticate, updateStore);

// Delete a store (owner only)
router.delete('/:storeId', authenticate, deleteStore);

module.exports = router; 