const BookingSlot = require('../models/booking-slot.model');
const cloudinaryService = require('../services/cloudinary.service');

const mapIncomingImage = async (imageData, fallbackAlt) => {
  if (typeof imageData === 'string' && imageData.startsWith('data:')) {
    const result = await cloudinaryService.uploadBase64(imageData, 'booking-slots');
    return {
      url: result.url,
      publicId: result.publicId,
      alt: fallbackAlt,
      isDefault: false,
    };
  }

  if (imageData && typeof imageData === 'object' && imageData.url) {
    return {
      url: imageData.url,
      publicId: imageData.publicId || null,
      alt: imageData.alt || fallbackAlt,
      isDefault: imageData.isDefault ?? false,
    };
  }

  return null;
};

const ensureDefaultImage = (images, fallbackAlt) => {
  if (!images || images.length === 0) {
    return [];
  }

  const hasDefault = images.some((image) => image.isDefault);
  if (!hasDefault) {
    images[0].isDefault = true;
  }

  return images.map((image, index) => ({
    ...image,
    alt: image.alt || fallbackAlt,
    isDefault: index === 0 ? true : Boolean(image.isDefault),
  }));
};

exports.createBookingSlot = async (req, res) => {
  try {
    const { 
      name, 
      description, 
      price, 
      compareAtPrice, 
      category, 
      bookingType,
      duration,
      capacity,
      availability,
      metadata,
      carDetails,
      propertyDetails,
      serviceDetails,
      seo,
      status,
      tags,
    } = req.body;
    
    const images = [];

    if (req.body.images && Array.isArray(req.body.images)) {
      for (const imageData of req.body.images) {
        const mappedImage = await mapIncomingImage(imageData, name);
        if (mappedImage) {
          images.push(mappedImage);
        }
      }
    }
    
    // Handle traditional file uploads
    if (req.files) {
      for (const file of req.files) {
        const base64Data = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
        const result = await cloudinaryService.uploadBase64(base64Data, 'booking-slots');
        images.push({
          url: result.url,
          publicId: result.publicId,
          alt: name,
          isDefault: images.length === 0
        });
      }
    }

    const normalizedImages = ensureDefaultImage(images, name);

    const bookingSlot = await BookingSlot.create({
      storeId: req.store._id,
      name,
      description,
      price: parseFloat(price),
      compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : null,
      category,
      bookingType,
      duration,
      capacity: capacity ? parseInt(capacity) : 1,
      availability: availability || { type: 'always' },
      metadata: metadata || new Map(),
      carDetails: carDetails || {},
      propertyDetails: propertyDetails || {},
      serviceDetails: serviceDetails || {},
      images: normalizedImages,
      seo: seo || {},
      status: status || 'draft',
      tags: tags || [],
    });

    res.status(201).json(bookingSlot);
  } catch (error) {
    console.error('Create booking slot error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getBookingSlots = async (req, res) => {
  try {
    const { search, category, bookingType, status, sortBy = 'createdAt', sortOrder = 'desc', page = 1, limit = 20 } = req.query;
    
    // Build query
    const query = { storeId: req.store._id };
    
    if (search) {
      query.$text = { $search: search };
    }
    
    if (category && category !== 'all') {
      query.category = category;
    }
    
    if (bookingType && bookingType !== 'all') {
      query.bookingType = bookingType;
    }
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [slots, total] = await Promise.all([
      BookingSlot.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      BookingSlot.countDocuments(query)
    ]);
    
    res.status(200).json({
      slots,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get booking slots error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getBookingSlot = async (req, res) => {
  try {
    const slot = await BookingSlot.findOne({
      _id: req.params.id,
      storeId: req.store._id,
    });

    if (!slot) {
      return res.status(404).json({ message: 'Booking slot not found' });
    }

    res.status(200).json(slot);
  } catch (error) {
    console.error('Get booking slot error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.updateBookingSlot = async (req, res) => {
  try {
    const slot = await BookingSlot.findOne({
      _id: req.params.id,
      storeId: req.store._id,
    });

    if (!slot) {
      return res.status(404).json({ message: 'Booking slot not found' });
    }

    const {
      name,
      description,
      price,
      compareAtPrice,
      category,
      bookingType,
      duration,
      capacity,
      availability,
      metadata,
      carDetails,
      propertyDetails,
      serviceDetails,
      seo,
      status,
      tags,
    } = req.body;

    // Handle images
    if (req.body.images && Array.isArray(req.body.images)) {
      const images = [];
      for (const imageData of req.body.images) {
        const mappedImage = await mapIncomingImage(imageData, name || slot.name);
        if (mappedImage) {
          images.push(mappedImage);
        }
      }
      if (images.length > 0) {
        slot.images = ensureDefaultImage(images, name || slot.name);
      }
    }

    // Handle file uploads
    if (req.files && req.files.length > 0) {
      const images = [...(slot.images || [])];
      for (const file of req.files) {
        const base64Data = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
        const result = await cloudinaryService.uploadBase64(base64Data, 'booking-slots');
        images.push({
          url: result.url,
          publicId: result.publicId,
          alt: name || slot.name,
          isDefault: false
        });
      }
      slot.images = ensureDefaultImage(images, name || slot.name);
    }

    // Update fields
    if (name) slot.name = name;
    if (description !== undefined) slot.description = description;
    if (price !== undefined) slot.price = parseFloat(price);
    if (compareAtPrice !== undefined) slot.compareAtPrice = compareAtPrice ? parseFloat(compareAtPrice) : null;
    if (category !== undefined) slot.category = category;
    if (bookingType) slot.bookingType = bookingType;
    if (duration) slot.duration = duration;
    if (capacity !== undefined) slot.capacity = parseInt(capacity);
    if (availability) slot.availability = availability;
    if (metadata) slot.metadata = new Map(Object.entries(metadata));
    if (carDetails) slot.carDetails = carDetails;
    if (propertyDetails) slot.propertyDetails = propertyDetails;
    if (serviceDetails) slot.serviceDetails = serviceDetails;
    if (seo) slot.seo = seo;
    if (status) slot.status = status;
    if (tags) slot.tags = tags;

    await slot.save();
    res.status(200).json(slot);
  } catch (error) {
    console.error('Update booking slot error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.deleteBookingSlot = async (req, res) => {
  try {
    const slot = await BookingSlot.findOne({
      _id: req.params.id,
      storeId: req.store._id,
    });

    if (!slot) {
      return res.status(404).json({ message: 'Booking slot not found' });
    }

    // Delete images from Cloudinary
    if (slot.images && slot.images.length > 0) {
      for (const image of slot.images) {
        if (image.publicId) {
          try {
            await cloudinaryService.deleteImage(image.publicId);
          } catch (error) {
            console.error('Error deleting image:', error);
          }
        }
      }
    }

    await BookingSlot.deleteOne({ _id: req.params.id });
    res.status(200).json({ message: 'Booking slot deleted successfully' });
  } catch (error) {
    console.error('Delete booking slot error:', error);
    res.status(500).json({ message: error.message });
  }
};

