const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { validateStoreAccess, validatePermission } = require('../middleware/store.middleware');
const customerController = require('../controllers/customer.controller');

// All routes require authentication first
router.use(authenticate);

// All routes require store access
router.use(validateStoreAccess);

// All routes require 'customers' permission
router.use(validatePermission('customers'));

// Export customers (must be before /:customerId routes)
router.get('/export', customerController.exportCustomers);

// Get customer statistics
router.get('/stats', customerController.getCustomerStats);

// Bulk actions
router.post('/bulk', customerController.bulkAction);

// Import customers
router.post('/import', customerController.importCustomers);

// Get all customers
router.get('/', customerController.getCustomers);

// Create a new customer
router.post('/', customerController.createCustomer);

// Get a specific customer
router.get('/:customerId', customerController.getCustomerById);

// Update a customer
router.patch('/:customerId', customerController.updateCustomer);

// Delete a customer
router.delete('/:customerId', customerController.deleteCustomer);

// Add customer note
router.post('/:customerId/notes', customerController.addCustomerNote);

// Get customer orders
router.get('/:customerId/orders', customerController.getCustomerOrders);

// Get customer analytics
router.get('/:customerId/analytics', customerController.getCustomerAnalytics);

// Update customer metadata
router.patch('/:customerId/metadata', customerController.updateCustomerMetadata);

module.exports = router; 