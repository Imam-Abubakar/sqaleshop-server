const mongoose = require('mongoose');
const slugify = require('slugify');

const bookingSlotSchema = new mongoose.Schema({
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  slug: {
    type: String,
    unique: true,
  },
  description: {
    type: String,
    trim: true,
  },
  images: [{
    url: String,
    publicId: String,
    alt: String,
    isDefault: Boolean,
  }],
  category: {
    type: String,
    trim: true,
  },
  bookingType: {
    type: String,
    enum: ['car_hire', 'apartment', 'hotel', 'service', 'other'],
    required: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  compareAtPrice: {
    type: Number,
    min: 0,
  },
  // Booking-specific fields
  duration: {
    type: String, // e.g., "15 minutes", "30 minutes", "1 hour", "2 hours", "5 hours", "12 hours", "1 day"
    required: true,
  },
  timeInterval: {
    type: Number, // Time interval in minutes for generating time slots (default: 30)
    default: 30,
    min: 15,
  },
  capacity: {
    type: Number, // For apartments/hotels: number of guests, for services: number of people
    default: 1,
  },
  // Availability settings
  availability: {
    type: {
      type: String,
      enum: ['always', 'scheduled', 'custom'],
      default: 'always',
    },
    // For scheduled availability
    schedule: [{
      day: {
        type: String,
        enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      },
      available: {
        type: Boolean,
        default: true,
      },
      startTime: String, // e.g., "09:00"
      endTime: String, // e.g., "17:00"
    }],
    // For custom availability (specific dates)
    customDates: [{
      date: Date,
      available: Boolean,
      startTime: String,
      endTime: String,
    }],
  },
  // Additional fields based on booking type
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
  },
  // For car hire
  carDetails: {
    make: String,
    model: String,
    year: Number,
    transmission: String,
    fuelType: String,
    seats: Number,
    features: [String],
  },
  // For apartments/hotels
  propertyDetails: {
    bedrooms: Number,
    bathrooms: Number,
    amenities: [String],
    location: String,
    checkIn: String, // e.g., "14:00"
    checkOut: String, // e.g., "11:00"
  },
  // For services
  serviceDetails: {
    location: String, // "in-store", "at-home", "both"
    requiresAddress: Boolean,
    estimatedDuration: String,
    requirements: [String],
  },
  seo: {
    title: String,
    description: String,
    keywords: [String],
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'archived'],
    default: 'draft',
  },
  tags: [String],
  analytics: {
    views: {
      type: Number,
      default: 0,
    },
    bookings: {
      type: Number,
      default: 0,
    },
    lastViewed: Date,
  },
}, {
  timestamps: true,
});

// Indexes
bookingSlotSchema.index({ name: 'text', description: 'text' });
bookingSlotSchema.index({ storeId: 1, status: 1 });
bookingSlotSchema.index({ storeId: 1, bookingType: 1 });

// Pre-save hook for slug generation
bookingSlotSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = slugify(this.name, { lower: true });
  }
  next();
});

module.exports = mongoose.model('BookingSlot', bookingSlotSchema);

