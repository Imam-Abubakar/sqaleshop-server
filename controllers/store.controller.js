const Business = require('../models/business.model');
const Product = require('../models/product.model');
const Service = require('../models/service.model');
const BookingSlot = require('../models/booking-slot.model');
const analyticsService = require('../services/analytics.service');
const { AppError } = require('../middleware/error.middleware');
const Store = require('../models/store.model');
const { ValidationError } = require('../utils/errors');
const User = require('../models/user.model');

exports.getStorefront = async (req, res, next) => {
  try {
    const { storeUrl } = req.params;
    
    // Find store by URL
    const store = await Store.findOne({ url: storeUrl });
    
    if (!store) {
      throw new AppError('Store not found', 404);
    }
    
    // Track page view
    // await analyticsService.trackPageView(store._id, 'storefront');

    // Get active products and services
    const [products, services] = await Promise.all([
      Product.find({ storeId: store._id, status: 'active' }).populate('category', 'name _id'),
      Service.find({ storeId: store._id, status: 'active' }),
    ]);

    res.json({
      store: {
        name: store.storeName,
        businessName: store.businessName,
        logo: store.logo,
        customization: store.customization || {},
        socialLinks: store.socialLinks || {},
        businessDescription: store.businessDescription || '',
      },
      products,
      services,
    });
  } catch (error) {
    next(error);
  }
};

exports.getUserStores = async (req, res, next) => {
  try {
    const userId = req.user._id;
    
    // Find stores where user is owner
    const ownedStores = await Store.find({ owner: userId }, {
      storeName: 1,
      businessName: 1,
      url: 1,
      logo: 1,
      currency: 1,
      createdAt: 1,
      owner: 1
    });
    
    // Find stores where user is a manager
    const managedStores = await Store.find({ 
      managers: { $in: [userId.toString()] } 
    }, {
      storeName: 1,
      businessName: 1,
      url: 1,
      logo: 1,
      currency: 1,
      createdAt: 1,
      managerPermissions: 1,
      managers: 1,
      owner: 1
    });
    
    // Format the response
    const stores = [
      // Owned stores with isOwner flag
      ...ownedStores.map(store => ({
        _id: store._id,
        storeName: store.storeName || store.businessName,
        url: store.url,
        logo: store.logo || '',
        currency: store.currency || 'NGN',
        createdAt: store.createdAt,
        isOwner: true,
        owner: store.owner.toString()
      })),
      
      // Managed stores with permissions
      ...managedStores.map(store => {
        const permissions = store.managerPermissions && 
          store.managerPermissions[userId.toString()] || [];
          
        return {
          _id: store._id,
          storeName: store.storeName || store.businessName,
          url: store.url,
          logo: store.logo || '',
          currency: store.currency || 'NGN',
          createdAt: store.createdAt,
          isOwner: false,
          permissions: permissions,
          managers: store.managers,
          owner: store.owner.toString()
        };
      })
    ];
    
    res.json(stores);
  } catch (error) {
    next(error);
  }
};

exports.getStoreById = async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const userId = req.user._id;
    
    // Find the store
    const store = await Store.findById(storeId);
    
    if (!store) {
      throw new AppError('Store not found', 404);
    }
    
    // Check if user has access to this store
    const isOwner = store.owner.toString() === userId.toString();
    const isManager = store.managers && store.managers.some(id => id.toString() === userId.toString());
    
    if (!isOwner && !isManager) {
      throw new AppError('Access denied', 403);
    }
    
    // If manager, include permissions
    let permissions = [];
    if (isManager) {
      permissions = store.managerPermissions && 
        store.managerPermissions.get(userId.toString()) || [];
    }
    
    res.json({
      _id: store._id,
      storeName: store.storeName,
      businessName: store.businessName,
      businessType: store.businessType,
      whatsappNumber: store.whatsappNumber,
      currency: store.currency,
      logo: store.logo,
      url: store.url,
      address: store.address,
      socialLinks: store.socialLinks,
      businessHours: store.businessHours,
      businessDescription: store.businessDescription,
      customization: store.customization,
      checkoutOptions: store.checkoutOptions,
      isOwner,
      permissions: isManager ? permissions : []
    });
  } catch (error) {
    next(error);
  }
};

exports.createStore = async (req, res, next) => {
  try {
    const { storeName, businessName, businessType, whatsappNumber, currency, url } = req.body;
    
    // Validate required fields
    if (!storeName || !businessName || !businessType || !whatsappNumber || !url) {
      throw new ValidationError('Missing required fields');
    }
    
    // Check if store URL is already taken
    const existingStore = await Store.findOne({ url });
    if (existingStore) {
      throw new ValidationError('Store URL is already taken');
    }

    const store = await Store.create({
      storeName,
      businessName,
      businessType,
      whatsappNumber,
      currency: currency || 'USD',
      url,
      customization: {
        template: 'simple',
        colors: {
          primary: '#3b82f6',
          secondary: '#6366f1',
          accent: '#f43f5e',
        },
        announcements: {
          enabled: false,
          text: 'Welcome to our store! Check out our latest products.',
          backgroundColor: '#fef3c7',
          textColor: '#92400e',
        },
        layoutOptions: {
          showHero: true,
          showCategories: true,
          showSearch: true,
          showSocialLinks: true,
        },
      },
      owner: req.user._id
    });

    // Update user's onboarding status if needed
    if (req.user.onboardingStatus === 'pending') {
      req.user.onboardingStatus = 'completed';
      await req.user.save();
    }

    res.status(201).json({
      _id: store._id,
      storeName: store.storeName,
      url: store.url,
      createdAt: store.createdAt,
      isOwner: true
    });
  } catch (error) {
    next(error);
  }
};

exports.updateStore = async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const updateData = req.body;
    
    // Prevent changing the owner
    delete updateData.owner;
    delete updateData.managers;
    delete updateData.managerPermissions;
    
    // If updating URL, check if it's already taken
    if (updateData.url) {
      const existingStore = await Store.findOne({ 
        url: updateData.url,
        _id: { $ne: storeId }
      });
      
      if (existingStore) {
        throw new ValidationError('Store URL is already taken');
      }
    }
    
    const store = await Store.findByIdAndUpdate(
      storeId,
      { $set: updateData },
      { new: true }
    );
    
    if (!store) {
      throw new AppError('Store not found', 404);
    }
    
    res.json({
      _id: store._id,
      storeName: store.storeName,
      businessName: store.businessName,
      url: store.url,
      logo: store.logo,
      updatedAt: Date.now()
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteStore = async (req, res, next) => {
  try {
    const { storeId } = req.params;
    
    // Find the store to delete
    const store = await Store.findById(storeId);
    
    if (!store) {
      throw new AppError('Store not found', 404);
    }
    
    // Only the owner can delete a store
    if (store.owner.toString() !== req.user._id.toString()) {
      throw new AppError('Access denied', 403);
    }
    
    // Delete all related data (products, orders, etc.)
    // This would typically be done with cascading delete or a transaction
    await Promise.all([
      Product.deleteMany({ storeId }),
      Service.deleteMany({ storeId }),
      // Add other models to delete
    ]);
    
    // Finally delete the store
    await Store.findByIdAndDelete(storeId);
    
    res.status(200).json({ message: 'Store deleted successfully' });
  } catch (error) {
    next(error);
  }
};

exports.getStore = async (req, res, next) => {
  try {
    const store = await Business.findById(req.params.id);
    if (!store) {
      throw new AppError('Store not found', 404);
    }
    res.json(store);
  } catch (error) {
    next(error);
  }
};

exports.getAvailableSlots = async (req, res, next) => {
  try {
    const { serviceId, date } = req.query;
    const { business } = req;

    const service = await Service.findOne({
      _id: serviceId,
      businessId: business._id,
      status: 'active',
    });

    if (!service) {
      throw new AppError('Service not found', 404);
    }

    // Get day of week (0-6)
    const dayOfWeek = new Date(date).getDay();
    
    // Get service availability for the day
    const dayAvailability = service.availability.find(a => a.dayOfWeek === dayOfWeek);
    if (!dayAvailability) {
      return res.json({ slots: [] });
    }

    // Generate available time slots
    const slots = generateTimeSlots(
      dayAvailability.startTime,
      dayAvailability.endTime,
      service.duration,
      []
    );

    res.json({ slots });
  } catch (error) {
    next(error);
  }
};

// Helper function to generate available time slots
function generateTimeSlots(startTime, endTime, duration, existingBookings) {
  const slots = [];
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  
  let currentSlot = new Date();
  currentSlot.setHours(startHour, startMinute, 0);
  
  const endDateTime = new Date();
  endDateTime.setHours(endHour, endMinute, 0);

  while (currentSlot < endDateTime) {
    const slotTime = currentSlot.toTimeString().slice(0, 5);
    
    // Add all available time slots
    slots.push(slotTime);

    // Move to next slot
    currentSlot.setMinutes(currentSlot.getMinutes() + duration);
  }

  return slots;
}

exports.getStoreByUrl = async (req, res, next) => {
  try {
    const { url } = req.params;
    
    // Fetch the store by URL
    const store = await Store.findOne({ url });
    
    if (!store) {
      throw new AppError('Store not found', 404);
    }
    
    // Fetch products and services for this store
    const fetchPromises = [
      Product.find({ businessId: store._id, status: 'active' }).populate('category', 'name _id'),
      Service.find({ businessId: store._id, status: 'active' }),
    ];
    
    // Fetch booking slots if bookings are enabled
    // Note: BookingSlot uses storeId, not businessId
    if (store.bookingSettings?.enabled) {
      fetchPromises.push(
        BookingSlot.find({ storeId: store._id.toString(), status: 'active' })
      );
    }
    
    const results = await Promise.all(fetchPromises);
    const products = results[0];
    const services = results[1];
    const bookingSlots = store.bookingSettings?.enabled ? results[2] : [];
    
    // Track page view if analytics service is available
    try {
      await analyticsService.trackPageView(store._id, 'storefront');
    } catch (error) {
      // Ignore analytics errors - they shouldn't disrupt the user experience
      console.error('Analytics error:', error);
    }
    
    res.json({
      business: {
        _id: store._id,
        name: store.storeName || store.businessName,
        storeName: store.storeName,
        businessName: store.businessName,
        url: store.url,
        email: store.email,
        whatsappNumber: store.whatsappNumber,
        currency: store.currency || 'NGN',
        businessType: store.businessType,
        businessDescription: store.businessDescription,
        address: store.address,
        socialLinks: store.socialLinks,
        businessHours: store.businessHours,
        seo: store.seo,
        settings: {
          logo: store.logo,
          colors: store.customization?.colors || {
            primary: '#3b82f6',
            secondary: '#10b981',
            accent: '#f43f5e'
          },
          theme: store.customization?.theme || 'default',
          layout: store.customization?.layout || 'standard',
          // Expose full customization so storefront can honor dashboard settings
          customization: {
            template: store.customization?.template || 'simple',
            hero: store.customization?.hero || {
              title: 'Discover Our Collection',
              subtitle: 'Explore our carefully curated selection of premium products, designed to enhance your lifestyle and meet your needs.',
            },
            banner: store.customization?.banner || {
              enabled: false,
              imageUrl: '',
            },
            announcements: store.customization?.announcements || {
              enabled: false,
              text: 'Welcome to our store! Check out our latest products.',
              backgroundColor: '#fef3c7',
              textColor: '#92400e',
            },
            layoutOptions: store.customization?.layoutOptions || {
              showHero: true,
              showCategories: true,
              showSearch: true,
              showSocialLinks: true,
            }
          }
        },
      },
      products,
      services,
      bookingSlots: bookingSlots || [],
      bookingSettings: store.bookingSettings || { enabled: false, disableProducts: false },
    });
  } catch (error) {
    next(error);
  }
}; 

// Public: Get checkout options for a store by URL
exports.getStoreCheckoutOptions = async (req, res, next) => {
  try {
    const { url } = req.params;
    const store = await Store.findOne({ url });

    if (!store) {
      throw new AppError('Store not found', 404);
    }

    return res.json({
      business: {
        name: store.storeName || store.businessName,
        currency: store.currency || 'NGN',
        whatsappNumber: store.whatsappNumber,
      },
      checkoutOptions: {
        ...store.checkoutOptions,
        guestCheckout: {
          enabled: store.checkoutOptions?.guestCheckout?.enabled ?? true,
          autoSaveCustomer: store.checkoutOptions?.guestCheckout?.autoSaveCustomer ?? true,
          requireAccount: store.checkoutOptions?.guestCheckout?.requireAccount ?? false,
        }
      },
    });
  } catch (error) {
    next(error);
  }
};