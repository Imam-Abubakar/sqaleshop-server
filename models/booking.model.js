const mongoose = require('mongoose');
const crypto = require('crypto');

const bookingSchema = new mongoose.Schema({
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true,
    index: true,
  },
  bookingNumber: {
    type: String,
    unique: true,
    index: true,
  },
  slot: {
    slotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BookingSlot',
      required: true,
    },
    snapshot: {
      name: { type: String, required: true },
      description: String,
      images: [String],
      bookingType: String,
      price: Number,
      duration: String,
      capacity: Number,
    },
  },
  customer: {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
    },
    email: { type: String, required: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    address: String,
  },
  // Booking-specific details
  bookingDetails: {
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    startTime: String, // e.g., "09:00"
    endTime: String, // e.g., "17:00"
    quantity: {
      type: Number,
      default: 1,
    },
    // Additional booking-specific data
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
    },
  },
  pricing: {
    subtotal: { type: Number, required: true },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    currency: { type: String, default: 'NGN' },
  },
  discount: {
    code: String,
    type: { type: String, enum: ['percentage', 'fixed'] },
    amount: Number,
    appliedAmount: Number,
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'],
    default: 'pending',
    index: true,
  },
  payment: {
    method: {
      type: String,
      enum: ['card', 'cash', 'bank_transfer', 'bankTransfer', 'mobile_money', 'crypto', 'whatsapp'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'partially_refunded', 'refunded'],
      default: 'pending',
    },
    amount: Number,
    currency: {
      type: String,
      default: 'NGN',
    },
    transactionId: String,
    gatewayResponse: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
    },
    proofOfPayment: String, // URL to uploaded proof
    processedAt: Date,
    failureReason: String,
    refundedAmount: {
      type: Number,
      default: 0,
    },
    refunds: [{
      amount: { type: Number, required: true },
      reason: String,
      method: { type: String, default: 'original' },
      processedAt: { type: Date, default: Date.now },
      processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
      },
    }],
  },
  timeline: [{
    status: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    note: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  }],
  notes: {
    customer: String,
    internal: String,
  },
  tags: [String],
  source: {
    type: String,
    enum: ['storefront', 'admin', 'api'],
    default: 'storefront',
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
  },
  // Public invoice access token (for secure, shareable invoice links)
  invoiceToken: {
    type: String,
    index: true,
  },
}, {
  timestamps: true,
});

// Indexes
bookingSchema.index({ storeId: 1, createdAt: -1 });
bookingSchema.index({ storeId: 1, status: 1 });
bookingSchema.index({ storeId: 1, 'customer.email': 1 });
bookingSchema.index({ storeId: 1, 'customer.phone': 1 });
bookingSchema.index({ 'payment.transactionId': 1 });
bookingSchema.index({ createdAt: -1 });
bookingSchema.index({ 'bookingDetails.startDate': 1 });
bookingSchema.index({ 'bookingDetails.endDate': 1 });

// Virtual for readable booking total
bookingSchema.virtual('formattedTotal').get(function() {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: this.pricing.currency || 'NGN'
  }).format(this.pricing.total);
});

// Virtual for current status details
bookingSchema.virtual('currentStatus').get(function() {
  const latestTimeline = this.timeline[this.timeline.length - 1];
  return {
    status: this.status,
    updatedAt: latestTimeline ? latestTimeline.timestamp : this.updatedAt,
    note: latestTimeline ? latestTimeline.note : null
  };
});

// Pre-save hook for booking number generation
bookingSchema.pre('save', async function(next) {
  try {
    // Generate booking number if new
    if (this.isNew && !this.bookingNumber) {
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const storePrefix = this.storeId.toString().slice(-3).toUpperCase();
      
      const count = await this.constructor.countDocuments({ 
        storeId: this.storeId,
        createdAt: {
          $gte: new Date(date.getFullYear(), date.getMonth(), 1),
          $lt: new Date(date.getFullYear(), date.getMonth() + 1, 1)
        }
      });
      
      this.bookingNumber = `BK${storePrefix}${year}${month}${(count + 1).toString().padStart(4, '0')}`;
    }

    // Generate invoice token for public invoice links
    if (this.isNew && !this.invoiceToken) {
      this.invoiceToken = crypto.randomBytes(16).toString('hex');
    }

    // Initialize timeline for new bookings
    if (this.isNew) {
      this.timeline = [{
        status: this.status,
        timestamp: new Date(),
        note: 'Booking created'
      }];
    }

    // Update timeline on status change
    if (this.isModified('status') && !this.isNew) {
      this.timeline.push({
        status: this.status,
        timestamp: new Date(),
        note: `Status changed to ${this.status}`
      });
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
bookingSchema.methods.updateStatus = function(newStatus, note, updatedBy) {
  this.status = newStatus;
  this.timeline.push({
    status: newStatus,
    timestamp: new Date(),
    note: note || `Status updated to ${newStatus}`,
    updatedBy
  });
  return this.save();
};

bookingSchema.methods.addNote = function(note, isInternal = false) {
  if (isInternal) {
    this.notes.internal = this.notes.internal ? `${this.notes.internal}\n\n${note}` : note;
  } else {
    this.notes.customer = this.notes.customer ? `${this.notes.customer}\n\n${note}` : note;
  }
  return this.save();
};

bookingSchema.methods.calculateRefundAmount = function() {
  const totalPaid = this.payment?.amount ?? this.pricing.total ?? 0;
  const alreadyRefunded = this.payment?.refundedAmount ?? 0;
  return Math.max(totalPaid - alreadyRefunded, 0);
};

bookingSchema.methods.canBeCancelled = function() {
  return ['pending', 'confirmed'].includes(this.status);
};

bookingSchema.methods.canBeRefunded = function() {
  const refundableBalance = this.calculateRefundAmount();
  const eligibleStatuses = ['completed', 'cancelled', 'no_show', 'partially_refunded'];
  const eligiblePaymentStatuses = ['completed', 'partially_refunded'];
  const paymentStatus = this.payment?.status;
  return refundableBalance > 0 &&
    eligibleStatuses.includes(this.status) &&
    paymentStatus &&
    eligiblePaymentStatuses.includes(paymentStatus);
};

module.exports = mongoose.model('Booking', bookingSchema);

