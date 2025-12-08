const Booking = require('../models/booking.model');
const BookingSlot = require('../models/booking-slot.model');
const Customer = require('../models/customer.model');
const Store = require('../models/store.model');
const { AppError } = require('../utils/errors');
const { sendBookingConfirmation, sendBookingStatusUpdate } = require('../services/email.service');

// Helper to get store from headers (for public bookings)
const getStoreFromHeaders = async (req) => {
  const storeUrl = req.headers['store-url'] || req.headers['storeurl'];
  if (!storeUrl) {
    throw new AppError('Store URL is required', 400);
  }
  const store = await Store.findOne({ url: storeUrl });
  if (!store) {
    throw new AppError('Store not found', 404);
  }
  return store;
};

exports.createBooking = async (req, res, next) => {
  try {
    // Parse bookingData from form data if it's a string
    let bookingData = req.body;
    if (req.body.bookingData && typeof req.body.bookingData === 'string') {
      try {
        bookingData = JSON.parse(req.body.bookingData);
      } catch (parseError) {
        throw new AppError('Invalid booking data format', 400);
      }
    }

    const {
      customer,
      slotId,
      bookingDetails,
      payment,
      discount,
      notes,
      source = 'storefront',
      subtotal,
      total,
      isGuestOrder = false
    } = bookingData;

    // Validate required fields
    if (!customer?.email || !customer?.name || !customer?.phone) {
      throw new AppError('Customer information is required', 400);
    }

    if (!slotId) {
      throw new AppError('Booking slot is required', 400);
    }

    if (!bookingDetails?.startDate || !bookingDetails?.endDate) {
      throw new AppError('Booking dates are required', 400);
    }

    // Get store information
    let store;
    let businessId;
    let storeId;

    if (req.store) {
      store = req.store;
      businessId = store.owner;
      storeId = store._id;
    } else {
      store = await getStoreFromHeaders(req);
      businessId = store.owner;
      storeId = store._id;
    }

    if (!storeId) {
      throw new AppError('Store ID is required', 400);
    }

    // Check if booking is enabled for this store
    if (!store.bookingSettings?.enabled) {
      throw new AppError('Bookings are not enabled for this store', 400);
    }

    // Get booking slot
    const slot = await BookingSlot.findById(slotId);
    if (!slot) {
      throw new AppError('Booking slot not found', 404);
    }

    if (slot.storeId.toString() !== storeId.toString()) {
      throw new AppError('Booking slot does not belong to this store', 403);
    }

    if (slot.status !== 'active') {
      throw new AppError('Booking slot is not available', 400);
    }

    // Create slot snapshot
    const slotSnapshot = {
      name: slot.name,
      description: slot.description,
      images: slot.images?.map(img => img.url) || [],
      bookingType: slot.bookingType,
      price: slot.price,
      duration: slot.duration,
      capacity: slot.capacity,
    };

    // Calculate pricing
    const calculatedSubtotal = subtotal || slot.price;
    const calculatedDiscount = discount?.appliedAmount || 0;
    const calculatedTotal = total || (calculatedSubtotal - calculatedDiscount);

    // Handle customer
    let existingCustomer = await Customer.findOne({
      email: customer.email.toLowerCase().trim(),
      businessId: businessId
    });

    if (!existingCustomer) {
      try {
        // Create new customer for guest checkout
        existingCustomer = new Customer({
          businessId: businessId,
          email: customer.email.toLowerCase().trim(),
          name: customer.name.trim(),
          phone: customer.phone?.trim(),
          address: customer.address?.trim(),
          metadata: {
            ...(isGuestOrder && { guestCustomer: true, firstOrderDate: new Date() })
          }
        });
        await existingCustomer.save();
      } catch (saveError) {
        // Handle duplicate key error - try to find the customer again
        if (saveError.code === 11000) {
          console.log('Duplicate key error detected, searching for existing customer...');
          
          // Try multiple search strategies
          existingCustomer = await Customer.findOne({ 
            email: customer.email.toLowerCase().trim(),
            businessId: businessId 
          });
          
          // If still not found, try without businessId constraint (in case of data inconsistency)
          if (!existingCustomer) {
            console.log('Customer not found with businessId constraint, trying without...');
            existingCustomer = await Customer.findOne({ 
              email: customer.email.toLowerCase().trim()
            });
            
            // If found but wrong businessId, update it
            if (existingCustomer && existingCustomer.businessId.toString() !== businessId.toString()) {
              console.log('Found customer with different businessId, updating...');
              existingCustomer.businessId = businessId;
              await existingCustomer.save();
            }
          }
          
          if (!existingCustomer) {
            console.error('Customer still not found after duplicate key error');
            throw new AppError('Customer creation failed due to duplicate email and could not locate existing customer', 400);
          }
          
          console.log('Found existing customer:', existingCustomer._id);
        } else {
          throw saveError;
        }
      }
    } else {
      console.log('Found existing customer:', existingCustomer._id);
    }

    // Update existing customer information if provided data is more complete
    const updates = {};
    if (customer.name && (!existingCustomer.name || customer.name.length > existingCustomer.name.length)) {
      updates.name = customer.name.trim();
    }
    if (customer.phone && (!existingCustomer.phone || customer.phone.length > existingCustomer.phone.length)) {
      updates.phone = customer.phone.trim();
    }
    if (customer.address && (!existingCustomer.address || customer.address.length > existingCustomer.address.length)) {
      updates.address = customer.address.trim();
    }
    if (Object.keys(updates).length > 0) {
      Object.assign(existingCustomer, updates);
      await existingCustomer.save();
    }

    // Handle payment proof upload
    let proofOfPaymentUrl = null;
    if (req.files && req.files.paymentProof) {
      const cloudinaryService = require('../services/cloudinary.service');
      const file = req.files.paymentProof;
      const base64Data = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      const result = await cloudinaryService.uploadBase64(base64Data, 'payment-proofs');
      proofOfPaymentUrl = result.url;
    }

    // Create booking
    const booking = await Booking.create({
      storeId,
      slot: {
        slotId: slot._id,
        snapshot: slotSnapshot,
      },
      customer: {
        customerId: existingCustomer._id,
        email: customer.email.toLowerCase().trim(),
        name: customer.name.trim(),
        phone: customer.phone?.trim(),
        address: customer.address?.trim(),
      },
      bookingDetails: {
        startDate: new Date(bookingDetails.startDate),
        endDate: new Date(bookingDetails.endDate),
        startTime: bookingDetails.startTime,
        endTime: bookingDetails.endTime,
        quantity: bookingDetails.quantity || 1,
        metadata: bookingDetails.metadata || {},
      },
      pricing: {
        subtotal: calculatedSubtotal,
        tax: 0,
        discount: calculatedDiscount,
        total: calculatedTotal,
        currency: store.currency || 'NGN',
      },
      discount: discount || null,
      status: 'pending',
      payment: {
        method: payment?.method || 'bank_transfer',
        status: 'pending',
        amount: calculatedTotal,
        currency: store.currency || 'NGN',
        proofOfPayment: proofOfPaymentUrl,
      },
      notes: {
        customer: notes || '',
        internal: '',
      },
      source,
    });

    // Send confirmation emails
    try {
      await sendBookingConfirmation(booking, store);
    } catch (emailError) {
      console.error('Error sending booking confirmation emails:', emailError);
      // Don't fail the booking creation if email fails
    }

    res.status(201).json({
      success: true,
      booking,
    });
  } catch (error) {
    console.error('Create booking error:', error);
    next(error);
  }
};

exports.getBookings = async (req, res, next) => {
  try {
    const {
      search,
      status,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 20
    } = req.query;

    const query = { storeId: req.store._id };

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { bookingNumber: { $regex: search, $options: 'i' } },
        { 'customer.name': { $regex: search, $options: 'i' } },
        { 'customer.email': { $regex: search, $options: 'i' } },
        { 'customer.phone': { $regex: search, $options: 'i' } },
      ];
    }

    if (startDate || endDate) {
      query['bookingDetails.startDate'] = {};
      if (startDate) {
        query['bookingDetails.startDate'].$gte = new Date(startDate);
      }
      if (endDate) {
        query['bookingDetails.startDate'].$lte = new Date(endDate);
      }
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [bookings, total] = await Promise.all([
      Booking.find(query)
        .populate('slot.slotId', 'name bookingType')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Booking.countDocuments(query)
    ]);

    res.json({
      bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get bookings error:', error);
    next(error);
  }
};

exports.getBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      storeId: req.store._id,
    })
      .populate('slot.slotId')
      .populate('customer.customerId');

    if (!booking) {
      throw new AppError('Booking not found', 404);
    }

    res.json(booking);
  } catch (error) {
    next(error);
  }
};

exports.updateBookingStatus = async (req, res, next) => {
  try {
    const { status, note, notifyCustomer = true } = req.body;

    const booking = await Booking.findOne({
      _id: req.params.id,
      storeId: req.store._id,
    });

    if (!booking) {
      throw new AppError('Booking not found', 404);
    }

    const oldStatus = booking.status;
    await booking.updateStatus(status, note, req.user._id);

    // Send status update email if requested
    if (notifyCustomer) {
      try {
        const store = await Store.findById(req.store._id);
        await sendBookingStatusUpdate(booking, store, oldStatus);
      } catch (emailError) {
        console.error('Error sending booking status update email:', emailError);
      }
    }

    res.json(booking);
  } catch (error) {
    next(error);
  }
};

exports.updateBookingPayment = async (req, res, next) => {
  try {
    const { status, transactionId, note } = req.body;

    const booking = await Booking.findOne({
      _id: req.params.id,
      storeId: req.store._id,
    });

    if (!booking) {
      throw new AppError('Booking not found', 404);
    }

    if (status) {
      booking.payment.status = status;
      if (status === 'completed') {
        booking.payment.processedAt = new Date();
      }
    }

    if (transactionId) {
      booking.payment.transactionId = transactionId;
    }

    if (note) {
      booking.addNote(note, true);
    }

    await booking.save();

    res.json(booking);
  } catch (error) {
    next(error);
  }
};

exports.cancelBooking = async (req, res, next) => {
  try {
    const { reason, notifyCustomer = true } = req.body;

    const booking = await Booking.findOne({
      _id: req.params.id,
      storeId: req.store._id,
    });

    if (!booking) {
      throw new AppError('Booking not found', 404);
    }

    if (!booking.canBeCancelled()) {
      throw new AppError('Booking cannot be cancelled', 400);
    }

    const oldStatus = booking.status;
    await booking.updateStatus('cancelled', reason || 'Booking cancelled', req.user._id);

    // Send cancellation email if requested
    if (notifyCustomer) {
      try {
        const store = await Store.findById(req.store._id);
        await sendBookingStatusUpdate(booking, store, oldStatus);
      } catch (emailError) {
        console.error('Error sending booking cancellation email:', emailError);
      }
    }

    res.json(booking);
  } catch (error) {
    next(error);
  }
};

/**
 * Get booking summary for confirmation page (public)
 */
exports.getBookingSummary = async (req, res, next) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId)
      .populate('slot.slotId', 'name description images bookingType duration capacity')
      .lean();

    if (!booking) {
      throw new AppError('Booking not found', 404);
    }

    // Format dates and times
    const formatDate = (date) => {
      if (!date) return '';
      return new Date(date).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    };

    const formatDateTime = (date, time) => {
      if (!date) return '';
      const dateStr = formatDate(date);
      return time ? `${dateStr} at ${time}` : dateStr;
    };

    res.json({
      success: true,
      booking: {
        id: booking._id,
        bookingNumber: booking.bookingNumber,
        status: booking.status,
        createdAt: booking.createdAt,
        // Customer details
        customer: {
          name: booking.customer?.name || '',
          email: booking.customer?.email || '',
          phone: booking.customer?.phone || '',
          address: booking.customer?.address || '',
        },
        // Slot details
        slot: {
          name: booking.slot?.snapshot?.name || booking.slot?.slotId?.name || '',
          description: booking.slot?.snapshot?.description || booking.slot?.slotId?.description || '',
          bookingType: booking.slot?.snapshot?.bookingType || booking.slot?.slotId?.bookingType || '',
          duration: booking.slot?.snapshot?.duration || booking.slot?.slotId?.duration || '',
          capacity: booking.slot?.snapshot?.capacity || booking.slot?.slotId?.capacity || 1,
          images: booking.slot?.snapshot?.images || booking.slot?.slotId?.images || [],
        },
        // Booking schedule
        schedule: {
          startDate: formatDate(booking.bookingDetails?.startDate),
          endDate: formatDate(booking.bookingDetails?.endDate),
          startDateTime: formatDateTime(booking.bookingDetails?.startDate, booking.bookingDetails?.startTime),
          endDateTime: formatDateTime(booking.bookingDetails?.endDate, booking.bookingDetails?.endTime),
          startTime: booking.bookingDetails?.startTime || '',
          endTime: booking.bookingDetails?.endTime || '',
          quantity: booking.bookingDetails?.quantity || 1,
        },
        // Pricing
        pricing: {
          subtotal: booking.pricing?.subtotal || 0,
          tax: booking.pricing?.tax || 0,
          discount: booking.pricing?.discount || 0,
          total: booking.pricing?.total || 0,
          currency: booking.pricing?.currency || 'NGN',
        },
        // Payment
        payment: {
          method: booking.payment?.method || '',
          status: booking.payment?.status || 'pending',
          amount: booking.payment?.amount || booking.pricing?.total || 0,
        },
        // Notes
        notes: booking.notes?.customer || '',
      }
    });
  } catch (error) {
    next(error);
  }
};

