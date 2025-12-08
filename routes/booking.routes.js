const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { validateStoreAccess, validatePermission } = require('../middleware/store.middleware');
const bookingController = require('../controllers/booking.controller');

const upload = multer({ storage: multer.memoryStorage() });

// Public booking creation (no auth required)
router.post('/public', upload.fields([{ name: 'paymentProof', maxCount: 1 }]), bookingController.createBooking);

// Public: Get booking summary for confirmation page (must be before /:id route)
router.get('/:bookingId/summary', bookingController.getBookingSummary);

// Authenticated routes
router.use(authenticate);
router.use(validateStoreAccess);
router.use(validatePermission('orders')); // Use orders permission for bookings

router.get('/', bookingController.getBookings);
router.patch('/:id/status', bookingController.updateBookingStatus);
router.patch('/:id/payment', bookingController.updateBookingPayment);
router.post('/:id/cancel', bookingController.cancelBooking);
router.get('/:id', bookingController.getBooking); // Must be last to avoid conflict with /summary

module.exports = router;

