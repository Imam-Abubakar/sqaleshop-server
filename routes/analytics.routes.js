const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { validateStoreAccess, validatePermission } = require('../middleware/store.middleware');
const analyticsController = require('../controllers/analytics.controller');

// Apply authentication to all routes first
router.use(authenticate);

// All routes require store access
router.use(validateStoreAccess);

// All routes require 'analytics' permission
router.use(validatePermission('analytics'));

/**
 * @swagger
 * /api/analytics/overview:
 *   get:
 *     summary: Get business overview analytics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analytics (defaults to 30 days ago)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analytics (defaults to current date)
 *     responses:
 *       200:
 *         description: Analytics overview data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:

 *                 totalProducts:
 *                   type: number
 *                 activeProducts:
 *                   type: number
 *                 totalServices:
 *                   type: number
 *                 activeServices:
 *                   type: number
 *       401:
 *         description: Not authenticated
 */
router.get('/overview', analyticsController.getBusinessAnalytics);

/**
 * @swagger
 * /api/analytics/bookings:
 *   get:
 *     summary: Get booking analytics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analytics
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analytics
 *     responses:
 *       200:
 *         description: Analytics data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalRevenue:
 *                   type: number
 *                 statusBreakdown:
 *                   type: object
 *                   properties:
 *                     pending:
 *                       type: number
 *                     confirmed:
 *                       type: number
 *                     cancelled:
 *                       type: number
 *                     completed:
 *                       type: number
 *       401:
 *         description: Not authenticated
 */


// Get analytics dashboard data
router.get('/', analyticsController.getDashboardData);

// Get sales report
router.get('/sales', analyticsController.getSalesReport);

// Get product performance
router.get('/products', analyticsController.getProductPerformance);

// Get customer insights
router.get('/api/customers', analyticsController.getCustomerInsights);

// Export analytics data
router.get('/export', analyticsController.exportAnalytics);

// Get dashboard stats
router.get('/dashboard/stats', analyticsController.getDashboardStats);

// Get dashboard performance (charts data)
router.get('/dashboard/performance', analyticsController.getDashboardPerformance);

// Page-specific stats endpoints
router.get('/orders/stats', analyticsController.getOrdersStats);
router.get('/products/stats', analyticsController.getProductsStats);
router.get('/bookings/stats', analyticsController.getBookingsStats);

module.exports = router; 