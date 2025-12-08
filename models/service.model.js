const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  description: String,
  duration: {
    type: Number, // in minutes
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  availability: [{
    dayOfWeek: {
      type: Number, // 0-6 (Sunday-Saturday)
      required: true,
    },
    startTime: {
      type: String, // HH:mm format
      required: true,
    },
    endTime: {
      type: String, // HH:mm format
      required: true,
    },
  }],
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
}, {
  timestamps: true,
});

/**
 * @swagger
 * components:
 *   schemas:
 *     Service:
 *       type: object
 *       required:
 *         - businessId
 *         - name
 *         - duration
 *         - price
 *       properties:
 *         businessId:
 *           type: string
 *           description: Reference to the business offering the service
 *         name:
 *           type: string
 *           description: Name of the service
 *         description:
 *           type: string
 *           description: Detailed description of the service
 *         duration:
 *           type: number
 *           description: Duration in minutes
 *         price:
 *           type: number
 *           description: Price of the service
 *         availability:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               dayOfWeek:
 *                 type: number
 *                 description: Day of week (0-6, Sunday-Saturday)
 *               startTime:
 *                 type: string
 *                 description: Start time in HH:mm format
 *               endTime:
 *                 type: string
 *                 description: End time in HH:mm format
 *         status:
 *           type: string
 *           enum: [active, inactive]
 *           default: active
 *           description: Current status of the service
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

module.exports = mongoose.model('Service', serviceSchema); 