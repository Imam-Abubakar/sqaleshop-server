const express = require('express');
const router = express.Router({ mergeParams: true }); // Enable access to businessId param
const { protect } = require('../middleware/auth.middleware');
const { verifyBusinessOwnership } = require('../middleware/business.middleware');
const {
  createService,
  getServices,
  getService,
  updateService,
  deleteService,
} = require('../controllers/service.controller');
const { authenticate } = require('../middleware/auth');

router.use(protect);
router.use(verifyBusinessOwnership);

/**
 * @swagger
 * /api/services:
 *   post:
 *     summary: Create a new service
 *     tags: [Services]
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
 *               - price
 *               - duration
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               duration:
 *                 type: number
 *                 description: Duration in minutes
 *               image:
 *                 type: string
 *     responses:
 *       201:
 *         description: Service created successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Not authenticated
 *   
 *   get:
 *     summary: Get all services for a store
 *     tags: [Services]
 *     parameters:
 *       - in: query
 *         name: storeId
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: List of services
 */
router.route('/')
  .post(createService)
  .get(getServices);

/**
 * @swagger
 * /api/services/{id}:
 *   get:
 *     summary: Get service by ID
 *     tags: [Services]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Service details
 *       404:
 *         description: Service not found
 *   
 *   patch:
 *     summary: Update service
 *     tags: [Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               duration:
 *                 type: number
 *               image:
 *                 type: string
 *     responses:
 *       200:
 *         description: Service updated successfully
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Service not found
 *   
 *   delete:
 *     summary: Delete service
 *     tags: [Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Service deleted successfully
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Service not found
 */
router.route('/:id')
  .get(getService)
  .put(updateService)
  .delete(deleteService);

module.exports = router; 