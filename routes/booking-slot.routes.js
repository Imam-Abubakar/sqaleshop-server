const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { validateStoreAccess, validatePermission } = require('../middleware/store.middleware');
const bookingSlotController = require('../controllers/booking-slot.controller');

const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate);
router.use(validateStoreAccess);
router.use(validatePermission('products')); // Use products permission for booking slots

router.post('/', upload.array('images', 10), bookingSlotController.createBookingSlot);
router.get('/', bookingSlotController.getBookingSlots);
router.get('/:id', bookingSlotController.getBookingSlot);
router.patch('/:id', upload.array('images', 10), bookingSlotController.updateBookingSlot);
router.delete('/:id', bookingSlotController.deleteBookingSlot);

module.exports = router;

