const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { validateStoreAccess, validatePermission } = require('../middleware/store.middleware');
const { validateBusinessAccess } = require('../middleware/business.middleware');
const orderController = require('../controllers/order.controller');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images for payment proof
    if (file.fieldname === 'paymentProof') {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed for payment proof'), false);
      }
    } else {
      cb(null, true);
    }
  }
});

// Public routes (for storefront order creation)
/**
 * @swagger
 * /api/orders:
 *   post:
 *     summary: Create a new order
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               customer:
 *                 type: object
 *                 properties:
 *                   email:
 *                     type: string
 *                   name:
 *                     type: string
 *                   phone:
 *                     type: string
 *                   address:
 *                     type: string
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     productId:
 *                       type: string
 *                     variantId:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     options:
 *                       type: object
 *               shipping:
 *                 type: object
 *                 properties:
 *                   method:
 *                     type: string
 *                   cost:
 *                     type: number
 *                   address:
 *                     type: object
 *               payment:
 *                 type: object
 *                 properties:
 *                   method:
 *                     type: string
 *               paymentProof:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: Invalid order data
 */
router.post('/', 
  // validateBusinessAccess, // Temporarily commented out - middleware doesn't exist
  upload.fields([{ name: 'paymentProof', maxCount: 1 }]),
  orderController.createOrder
);

/**
 * @swagger
 * /api/orders/{orderId}/summary:
 *   get:
 *     summary: Get order summary for confirmation
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order summary retrieved successfully
 *       404:
 *         description: Order not found
 */
router.get('/:orderId/summary', orderController.getOrderSummary);

/**
 * Public: Get invoice details by order ID and token
 */
router.get('/:orderId/invoice/:token', orderController.getPublicInvoice);

// Protected routes - require authentication
router.use(authenticate);
router.use(validateStoreAccess);

// Debug middleware to log requests
router.use((req, res, next) => {
  console.log(`Order route accessed: ${req.method} ${req.path}`);
  console.log('Headers:', req.headers);
  next();
});

// Admin/Manager routes - require orders permission
router.use(validatePermission('orders'));

/**
 * @swagger
 * /api/orders:
 *   get:
 *     summary: Get all orders with filtering and pagination
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, confirmed, processing, shipped, delivered, cancelled, refunded]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: paymentStatus
 *         schema:
 *           type: string
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: Orders retrieved successfully
 */
router.get('/', orderController.getOrders);

/**
 * @swagger
 * /api/orders/analytics:
 *   get:
 *     summary: Get order analytics
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [7d, 30d, 90d, 1y]
 *           default: 30d
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *           default: day
 *     responses:
 *       200:
 *         description: Analytics data retrieved successfully
 */
router.get('/analytics', orderController.getOrderAnalytics);

/**
 * @swagger
 * /api/orders/export:
 *   get:
 *     summary: Export orders to CSV or JSON
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, json]
 *           default: csv
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Orders exported successfully
 */
router.get('/export', orderController.exportOrders);

/**
 * @swagger
 * /api/orders/bulk:
 *   post:
 *     summary: Perform bulk actions on orders
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [updateStatus, export, addTag, removeTag]
 *               orderIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               status:
 *                 type: string
 *               note:
 *                 type: string
 *               tag:
 *                 type: string
 *               notifyCustomers:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Bulk action completed successfully
 */
router.post('/bulk', orderController.bulkAction);

/**
 * @swagger
 * /api/orders/{orderId}:
 *   get:
 *     summary: Get a specific order by ID
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order retrieved successfully
 *       404:
 *         description: Order not found
 */
router.get('/:orderId', orderController.getOrder);

/**
 * @swagger
 * /api/orders/{orderId}/status:
 *   patch:
 *     summary: Update order status
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
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
 *               status:
 *                 type: string
 *                 enum: [pending, confirmed, processing, shipped, delivered, cancelled, refunded]
 *               note:
 *                 type: string
 *               notifyCustomer:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Order status updated successfully
 */
router.patch('/:orderId/status', orderController.updateOrderStatus);

/**
 * @swagger
 * /api/orders/{orderId}/payment:
 *   patch:
 *     summary: Update payment status
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
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
 *               paymentStatus:
 *                 type: string
 *                 enum: [pending, processing, completed, failed, cancelled]
 *               transactionId:
 *                 type: string
 *               gatewayResponse:
 *                 type: object
 *     responses:
 *       200:
 *         description: Payment status updated successfully
 */
router.patch('/:orderId/payment', orderController.updatePaymentStatus);

/**
 * @swagger
 * /api/orders/{orderId}/notes:
 *   post:
 *     summary: Add a note to an order
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
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
 *               note:
 *                 type: string
 *               isInternal:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Note added successfully
 */
router.post('/:orderId/notes', orderController.addOrderNote);

/**
 * @swagger
 * /api/orders/{orderId}/cancel:
 *   post:
 *     summary: Cancel an order
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
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
 *               reason:
 *                 type: string
 *               refundAmount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Order cancelled successfully
 */
router.post('/:orderId/cancel', orderController.cancelOrder);

/**
 * @swagger
 * /api/orders/{orderId}/refund:
 *   post:
 *     summary: Process a refund for an order
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
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
 *               amount:
 *                 type: number
 *               reason:
 *                 type: string
 *               method:
 *                 type: string
 *                 default: original
 *     responses:
 *       200:
 *         description: Refund processed successfully
 */
router.post('/:orderId/refund', orderController.processRefund);

/**
 * @swagger
 * /api/orders/{orderId}/fulfillment:
 *   patch:
 *     summary: Update fulfillment status
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
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
 *               type:
 *                 type: string
 *                 enum: [packaged, shipped, delivered]
 *               status:
 *                 type: boolean
 *               metadata:
 *                 type: object
 *                 properties:
 *                   trackingNumber:
 *                     type: string
 *                   carrier:
 *                     type: string
 *                   confirmedBy:
 *                     type: string
 *                   photo:
 *                     type: string
 *     responses:
 *       200:
 *         description: Fulfillment status updated successfully
 */
router.patch('/:orderId/fulfillment', orderController.updateFulfillment);

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB.',
      });
    }
  }
  next(error);
});

module.exports = router;