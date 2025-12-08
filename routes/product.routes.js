const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { validateStoreAccess, validatePermission } = require('../middleware/store.middleware');
const productController = require('../controllers/product.controller');


const upload = multer({ storage: multer.memoryStorage() });
router.use(authenticate);
router.use(validateStoreAccess);
router.use(validatePermission('products'));
router.post('/', upload.array('images', 10), productController.createProduct);
router.get('/', productController.getProducts);
router.get('/upload/signature', productController.getImageUploadSignature);
router.get('/:productId', productController.getProductById);
router.patch('/:productId', upload.array('images', 10), productController.updateProduct);
router.delete('/:productId', productController.deleteProduct);
router.patch('/:productId/inventory', productController.updateInventory);
router.post('/:productId/duplicate', productController.duplicateProduct);


module.exports = router; 