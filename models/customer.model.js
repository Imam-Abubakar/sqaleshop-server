/**
 * @swagger
 * components:
 *   schemas:
 *     Customer:
 *       type: object
 *       required:
 *         - businessId
 *         - name
 *         - email
 *       properties:
 *         businessId:
 *           type: string
 *           description: Reference to the business this customer belongs to
 *         name:
 *           type: string
 *           description: Customer's full name
 *         email:
 *           type: string
 *           format: email
 *           description: Customer's email address
 *         phone:
 *           type: string
 *           description: Customer's phone number
 *         notes:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 description: Note content
 *               createdAt:
 *                 type: string
 *                 format: date-time
 *               createdBy:
 *                 type: string
 *                 description: Reference to user who created the note
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *           description: Tags/labels associated with the customer
 *         metadata:
 *           type: object
 *           description: Additional custom fields for the customer
 *         orders:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Order'
 *           description: Virtual field containing customer's orders
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  notes: [{
    content: String,
    createdAt: Date,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  tags: [{
    type: String,
    trim: true
  }],
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for orders
customerSchema.virtual('orders', {
  ref: 'Order',
  localField: '_id',
  foreignField: 'customerId'
});

// Index for faster searches and ensure email uniqueness per business
customerSchema.index({ businessId: 1, email: 1 }, { unique: true });
customerSchema.index({ businessId: 1, name: 'text', email: 'text' });

const Customer = mongoose.model('Customer', customerSchema);

module.exports = Customer; 