const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, restrictTo } = require('../middleware/auth.middleware');
const {
  createBusiness,
  getBusinesses,
  getBusiness,
  updateBusiness,
  deleteBusiness,
  updateDomain,
} = require('../controllers/business.controller');

// Configure multer for file uploads (memory storage for serverless)
const upload = multer({ storage: multer.memoryStorage() });

/**
 * @swagger
 * /api/businesses:
 *   post:
 *     summary: Create a new business
 *     tags: [Businesses]
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
 *             properties:
 *               name:
 *                 type: string
 *                 description: The business name
 *     responses:
 *       201:
 *         description: Business created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
router.post('/', protect, restrictTo('owner'), createBusiness);

/**
 * @swagger
 * /api/businesses:
 *   get:
 *     summary: Get all businesses owned by the user
 *     tags: [Businesses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of businesses
 *       401:
 *         description: Unauthorized
 */
router.get('/', protect, getBusinesses);

router.get('/:id', getBusiness);
router.put('/:id', upload.single('logo'), updateBusiness);
router.delete('/:id', deleteBusiness);
router.put('/:id/domain', updateDomain);

module.exports = router; 