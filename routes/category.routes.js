const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { validateStoreAccess, validatePermission } = require('../middleware/store.middleware');
const categoryController = require('../controllers/category.controller');

// Configure multer for file uploads (memory storage for serverless)
const upload = multer({ storage: multer.memoryStorage() });

// All routes require authentication first
router.use(authenticate);

// All routes require store access
router.use(validateStoreAccess);

// All routes require 'categories' permission
router.use(validatePermission('categories'));

// Create a new category
router.post('/', upload.single('image'), categoryController.createCategory);

// Get all categories
router.get('/', categoryController.getCategories);
router.get('/:categoryId', categoryController.getCategory);
router.patch('/:categoryId', upload.single('image'), categoryController.updateCategory);
router.delete('/:categoryId', categoryController.deleteCategory);
router.delete('/:categoryId/move-products', categoryController.moveProductsAndDeleteCategory);
router.patch('/reorder', categoryController.reorderCategories);

module.exports = router;
