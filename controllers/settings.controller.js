const User = require('../models/user.model');
const Store = require('../models/store.model');
const Business = require('../models/business.model');
const { ValidationError } = require('../utils/errors');
const { AppError } = require('../middleware/error.middleware');
const DomainUtils = require('../utils/domain.utils');
const axios = require('axios');

// SECTION 1: My Profile
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, email, whatsappNumber } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Handle email change with verification
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        throw new ValidationError('Email already in use');
      }
      
      // Generate OTP and store pending email change
      const otp = user.createEmailVerificationOTP(email.toLowerCase());
      await user.save();
      
      // Send verification email to the new email address
      const { sendEmailChangeVerification } = require('../services/email.service');
      await sendEmailChangeVerification(email.toLowerCase(), otp);
      
      // Return with pending status
      return res.json({
        id: user._id,
        email: user.email,
        name: user.name,
        whatsappNumber: user.whatsappNumber,
        pendingEmailChange: true,
        pendingEmail: email.toLowerCase(),
        message: 'Verification code sent to your new email address'
      });
    }

    if (name) user.name = name;
    if (whatsappNumber) user.whatsappNumber = whatsappNumber;
    
    await user.save();

    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      whatsappNumber: user.whatsappNumber,
      role: user.role,
      onboardingStatus: user.onboardingStatus
    });
  } catch (error) {
    next(error);
  }
};

// Handle email verification OTP
exports.verifyEmailChange = async (req, res, next) => {
  try {
    const { otp } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!user.emailVerification) {
      throw new ValidationError('No pending email change found');
    }

    const isValid = user.verifyEmailOTP(otp);

    if (!isValid) {
      throw new ValidationError('Invalid or expired verification code');
    }

    await user.save();

    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      whatsappNumber: user.whatsappNumber,
      role: user.role,
      onboardingStatus: user.onboardingStatus,
      message: 'Email address successfully updated'
    });
  } catch (error) {
    next(error);
  }
};

// Resend email verification OTP
exports.resendEmailVerification = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!user.emailVerification || !user.emailVerification.newEmail) {
      throw new ValidationError('No pending email change found');
    }

    // Generate new OTP while keeping the same newEmail
    const newEmail = user.emailVerification.newEmail;
    const otp = user.createEmailVerificationOTP(newEmail);
    await user.save();
    
    // Send verification email to the new email address
    const { sendEmailChangeVerification } = require('../services/email.service');
    await sendEmailChangeVerification(newEmail, otp);
    
    res.json({
      message: 'Verification code resent successfully',
      pendingEmailChange: true,
      pendingEmail: newEmail
    });
  } catch (error) {
    next(error);
  }
};

// Cancel pending email change
exports.cancelEmailChange = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!user.emailVerification) {
      throw new ValidationError('No pending email change found');
    }

    // Clear pending email change data
    user.emailVerification = undefined;
    await user.save();

    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      whatsappNumber: user.whatsappNumber,
      role: user.role,
      onboardingStatus: user.onboardingStatus,
      message: 'Email change request cancelled'
    });
  } catch (error) {
    next(error);
  }
};

// SECTION 2: Store Details
exports.updateStoreDetails = async (req, res, next) => {
  try {
    const { 
      storeName, 
      businessName, 
      businessType,
      whatsappNumber,
      currency,
      url,
      address,
      socialLinks,
      businessHours,
      businessDescription,
      seo,
      logo
    } = req.body;

    // Find the store owned by the user
    const store = await Store.findById(req.store._id);
    
    if (!store) {
      throw new AppError('Store not found', 404);
    }

    // Check if URL is being changed and validate it
    if (url && url !== store.url) {
      // Check if new URL is already taken
      const existingStore = await Store.findOne({ url });
      if (existingStore && existingStore._id.toString() !== store._id.toString()) {
        throw new ValidationError('Store URL is already taken');
      }
    }

    // Update store details
    if (storeName) store.storeName = storeName;
    if (businessName) store.businessName = businessName;
    if (businessType) store.businessType = businessType;
    if (whatsappNumber) store.whatsappNumber = whatsappNumber;
    if (currency) store.currency = currency;
    if (url) store.url = url;
    
    // Update address if provided
    if (address) {
      store.address = address;
    }

    // Update social links if provided
    if (socialLinks) {
      store.socialLinks = socialLinks;
    }

    // Update business hours if provided
    if (businessHours) {
      store.businessHours = businessHours;
    }

    // Update business description if provided
    if (businessDescription) {
      store.businessDescription = businessDescription;
    }

    // Update SEO settings if provided
    if (seo) {
      store.seo = seo;
    }

    // Handle logo upload if base64 data is provided
    if (logo) {
      const cloudinary = require('../services/cloudinary.service');
      const cloudinaryResult = await cloudinary.uploadBase64(logo, 'store-logos');
      store.logo = cloudinaryResult.url;
    }

    await store.save();
    res.json(store);
  } catch (error) {
    next(error);
  }
};

// SECTION 3: Checkout Options
exports.updateCheckoutOptions = async (req, res, next) => {
  try {
    const { 
      productDeliveryOptions, 
      paymentOptions,
      whatsapp: whatsappOptions,
      guestCheckout: guestCheckoutOptions
    } = req.body;

    // Find the store owned by the user
    const store = await Store.findById(req.store._id);
    
    if (!store) {
      throw new AppError('Store not found', 404);
    }

    // Initialize checkoutOptions if not exists
    store.checkoutOptions = store.checkoutOptions || {};

    // Update product delivery options
    if (productDeliveryOptions) {
      // Validate delivery locations format
      if (productDeliveryOptions.deliveryLocations) {
        // Ensure each location has name and price
        productDeliveryOptions.deliveryLocations = productDeliveryOptions.deliveryLocations
          .filter(location => location.name && location.price !== undefined)
          .map(location => ({
            name: location.name,
            price: Number(location.price)
          }));
      }
      
      store.checkoutOptions.productDelivery = productDeliveryOptions;
    }



    // Update payment options
    if (paymentOptions) {
      const existingPaymentOptions = store.checkoutOptions.paymentOptions || {};
      const updatedPaymentOptions = { ...existingPaymentOptions };

      if (paymentOptions.bankTransfer) {
        const incomingBankTransfer = paymentOptions.bankTransfer;
        const existingBankTransfer = existingPaymentOptions.bankTransfer || {};

        const sanitizedBankTransfer = {
          ...existingBankTransfer,
          ...incomingBankTransfer,
          enabled: Boolean(
            incomingBankTransfer.enabled ??
            existingBankTransfer.enabled ??
            false
          ),
        };

        if (Object.prototype.hasOwnProperty.call(incomingBankTransfer, 'accounts')) {
          const accountsArray = Array.isArray(incomingBankTransfer.accounts)
            ? incomingBankTransfer.accounts
            : [];

          sanitizedBankTransfer.accounts = accountsArray
            .filter(
              (account) =>
                account &&
                account.accountName &&
                account.accountNumber &&
                account.bankName
            )
            .map((account) => ({
              accountName: account.accountName.trim(),
              accountNumber: String(account.accountNumber).trim(),
              bankName: account.bankName.trim(),
            }));
        } else if (!sanitizedBankTransfer.accounts) {
          sanitizedBankTransfer.accounts = existingBankTransfer.accounts || [];
        }

        if (Object.prototype.hasOwnProperty.call(incomingBankTransfer, 'accountInfo')) {
          sanitizedBankTransfer.accountInfo = incomingBankTransfer.accountInfo || '';
        }

        updatedPaymentOptions.bankTransfer = sanitizedBankTransfer;
      }

      if (paymentOptions.cashOnDelivery) {
        const incomingCash = paymentOptions.cashOnDelivery;
        const existingCash = existingPaymentOptions.cashOnDelivery || {};

        updatedPaymentOptions.cashOnDelivery = {
          ...existingCash,
          ...incomingCash,
          enabled: Boolean(
            incomingCash.enabled ??
            existingCash.enabled ??
            false
          ),
        };
      }

      if (paymentOptions.manualPayment) {
        const incomingManual = paymentOptions.manualPayment;
        const existingManual = existingPaymentOptions.manualPayment || {};

        const sanitizedManual = {
          ...existingManual,
          ...incomingManual,
          enabled: Boolean(
            incomingManual.enabled ??
            existingManual.enabled ??
            false
          ),
        };

        if (Object.prototype.hasOwnProperty.call(incomingManual, 'instructions')) {
          sanitizedManual.instructions = incomingManual.instructions || '';
        }

        updatedPaymentOptions.manualPayment = sanitizedManual;
      }

      store.checkoutOptions.paymentOptions = updatedPaymentOptions;
    }

    // Update WhatsApp options
    if (whatsappOptions) {
      store.checkoutOptions.whatsapp = {
        enabled: Boolean(whatsappOptions.enabled)
      };
    }

    // Update guest checkout options
    if (guestCheckoutOptions) {
      store.checkoutOptions.guestCheckout = {
        enabled: Boolean(guestCheckoutOptions.enabled),
        autoSaveCustomer: Boolean(guestCheckoutOptions.autoSaveCustomer),
        requireAccount: Boolean(guestCheckoutOptions.requireAccount)
      };
    }

    await store.save();
    res.json(store.checkoutOptions);
  } catch (error) {
    next(error);
  }
};

// SECTION 4: Store Customization
exports.updateStoreCustomization = async (req, res, next) => {
  try {
    const { template, theme, colors, layout, hero, banner, announcements, layoutOptions } = req.body;

    // Find the store owned by the user
    const store = await Store.findById(req.store._id);
    
    if (!store) {
      throw new AppError('Store not found', 404);
    }

    // Initialize customization object if not exists
    store.customization = store.customization || {};

    // Update template if provided
    if (template) {
      store.customization.template = template;
    }

    // Update theme if provided
    if (theme) {
      store.customization.theme = theme;
    }

    // Update colors if provided
    if (colors) {
      store.customization.colors = colors;
    }

    // Update layout if provided
    if (layout) {
      store.customization.layout = layout;
    }

    // Update hero if provided
    if (hero) {
      store.customization.hero = hero;
    }

    // Update banner if provided
    if (banner) {
      // Initialize banner object if not exists
      store.customization.banner = store.customization.banner || {};
      
      // Update banner enabled status
      if (banner.enabled !== undefined) {
        store.customization.banner.enabled = banner.enabled;
      }
      
      // Handle banner image upload if base64 data is provided
      if (banner.imageData && typeof banner.imageData === 'string' && banner.imageData.startsWith('data:')) {
        const cloudinary = require('../services/cloudinary.service');
        const cloudinaryResult = await cloudinary.uploadBase64(banner.imageData, 'store-banners');
        store.customization.banner.imageUrl = cloudinaryResult.url;
      } else if (banner.imageUrl) {
        // Update imageUrl if provided directly (for URL input)
        store.customization.banner.imageUrl = banner.imageUrl;
      }
    }

    // Update announcements if provided
    if (announcements) {
      store.customization.announcements = announcements;
    }

    // Update layout options if provided
    if (layoutOptions) {
      store.customization.layoutOptions = layoutOptions;
    }

    await store.save();
    res.json(store.customization);
  } catch (error) {
    next(error);
  }
};

// SECTION 5: Store Managers
exports.getStoreManagers = async (req, res, next) => {
  try {
    // Find the store owned by the user
    const store = await Store.findById(req.store._id);
    
    if (!store) {
      throw new AppError('Store not found', 404);
    }

    // Find all managers for this store
    const managers = await User.find({ 
      _id: { $in: store.managers || [] }
    }, 'name email role permissions');

    // Add the store-specific permissions to each manager
    const managersWithPermissions = managers.map(manager => {
      const managerObj = manager.toObject();
      const managerId = manager._id.toString();
      
      // Get store-specific permissions for this manager
      if (store.managerPermissions && store.managerPermissions.get) {
        managerObj.storePermissions = store.managerPermissions.get(managerId) || [];
      } else {
        managerObj.storePermissions = [];
      }
      
      return managerObj;
    });

    res.json(managersWithPermissions);
  } catch (error) {
    next(error);
  }
};

exports.inviteStoreManager = async (req, res, next) => {
  try {
    const { email, permissions } = req.body;

    if (!email) {
      throw new ValidationError('Email is required');
    }

    // Find the store owned by the user
    const store = await Store.findById(req.store._id);
    
    if (!store) {
      throw new AppError('Store not found', 404);
    }

    // Check if user exists
    let manager = await User.findOne({ email: email.toLowerCase() });

    if (!manager) {
      // Create new user with pending status and manager role
      manager = await User.create({
        email: email.toLowerCase(),
        role: 'manager', // Set correct role as manager
        onboardingStatus: 'completed' // Skip onboarding for managers
      });
    } else {
      // If user exists but isn't a manager yet, update their role
      if (manager.role !== 'manager' && manager.role !== 'owner') {
        manager.role = 'manager';
        manager.onboardingStatus = 'completed'; // Skip onboarding for managers
        await manager.save();
      }
    }

    // Initialize managers array if not exists
    store.managers = store.managers || [];
    
    // Check if user is already a manager
    if (store.managers.includes(manager._id)) {
      throw new ValidationError('User is already a manager for this store');
    }

    // Add user as a manager
    store.managers.push(manager._id);

    // Set permissions for this manager
    if (!store.managerPermissions) {
      store.managerPermissions = new Map();
    }
    store.managerPermissions.set(manager._id.toString(), permissions || []);

    // Send invitation email to the user
    const { sendManagerInvitationEmail } = require('../services/email.service');
    await sendManagerInvitationEmail(email, store.storeName || store.businessName, permissions);

    await store.save();
    
    // Create response object with manager data and permissions
    const managerData = manager.toObject();
    managerData.storePermissions = permissions || [];
    
    res.status(201).json({
      message: 'Invitation sent successfully',
      manager: managerData
    });
  } catch (error) {
    next(error);
  }
};

exports.removeStoreManager = async (req, res, next) => {
  try {
    const { managerId } = req.params;

    // Find the store owned by the user
    const store = await Store.findById(req.store._id);
    
    if (!store) {
      throw new AppError('Store not found', 404);
    }

    // Remove manager from the store
    if (store.managers && store.managers.length) {
      store.managers = store.managers.filter(id => id.toString() !== managerId);
    }

    // Remove permissions for this manager
    if (store.managerPermissions && store.managerPermissions.delete) {
      store.managerPermissions.delete(managerId);
    }

    await store.save();
    res.json({ message: 'Manager removed successfully' });
  } catch (error) {
    next(error);
  }
};

exports.updateManagerPermissions = async (req, res, next) => {
  try {
    const { managerId } = req.params;
    const { permissions } = req.body;
    
    // Find the store
    const store = await Store.findById(req.store._id);
    
    if (!store) {
      throw new AppError('Store not found', 404);
    }
    
    // Check if manager exists
    if (!store.managers.includes(managerId)) {
      throw new ValidationError('Manager not found for this store');
    }
    
    // Update permissions
    if (!store.managerPermissions) {
      store.managerPermissions = new Map();
    }
    store.managerPermissions.set(managerId, permissions || []);
    
    // Get manager details
    const manager = await User.findById(managerId);
    if (!manager) {
      throw new ValidationError('Manager user not found');
    }
    
    // Send notification email about permission update
    const { sendManagerPermissionUpdateEmail } = require('../services/email.service');
    await sendManagerPermissionUpdateEmail(manager.email, store.storeName || store.businessName, permissions);
    
    await store.save();
    
    // Create response object with manager data and updated permissions
    const managerData = manager.toObject();
    managerData.storePermissions = permissions || [];
    
    res.json({
      message: 'Permissions updated successfully',
      manager: managerData
    });
  } catch (error) {
    next(error);
  }
};

// SECTION 6: Booking Settings
exports.updateBookingSettings = async (req, res, next) => {
  try {
    const { enabled, disableProducts } = req.body;

    // Find the store owned by the user
    const store = await Store.findById(req.store._id);
    
    if (!store) {
      throw new AppError('Store not found', 404);
    }

    // Initialize bookingSettings if not exists
    store.bookingSettings = store.bookingSettings || {};

    // Update enabled status
    if (enabled !== undefined) {
      store.bookingSettings.enabled = Boolean(enabled);
    }

    // Update disableProducts status
    if (disableProducts !== undefined) {
      store.bookingSettings.disableProducts = Boolean(disableProducts);
    }

    await store.save();
    res.json(store.bookingSettings);
  } catch (error) {
    next(error);
  }
};

// SECTION 7: Premium Domain (Growth plan only)
exports.requestPremiumDomain = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (user.plan !== 'growth') {
      throw new AppError('Premium domains are available only on the Growth plan', 403);
    }

    const store = await Store.findById(req.store._id);

    if (!store) {
      throw new AppError('Store not found', 404);
    }

    // If already active, just return current data
    if (store.premiumDomainStatus === 'active' && store.customDomain) {
      return res.json({
        premiumDomain: store.customDomain,
        status: store.premiumDomainStatus,
      });
    }

    const subdomain = store.url;
    if (!subdomain) {
      throw new ValidationError('Store URL is required to generate a premium domain');
    }

    const fullDomain = DomainUtils.getFullDomain(subdomain);

    // Mark request time and pending status before any external calls
    store.premiumDomainRequestedAt = new Date();
    store.premiumDomainStatus = 'pending';
    await store.save();

    // Netlify integration is required for explicit subdomain creation
    try {
      const { NETLIFY_API_TOKEN, NETLIFY_DNS_ZONE_ID, NETLIFY_DNS_TARGET } = process.env;

      if (!NETLIFY_API_TOKEN || !NETLIFY_DNS_ZONE_ID || !NETLIFY_DNS_TARGET) {
        throw new AppError(
          'Premium domain DNS configuration is not available. Please contact support to configure Netlify DNS integration.',
          500
        );
      }

      // Create a DNS record in Netlify DNS for this storefront subdomain
      try {
        await axios({
          method: 'post',
          url: `https://api.netlify.com/api/v1/dns_zones/${NETLIFY_DNS_ZONE_ID}/dns_records`,
          headers: {
            Authorization: `Bearer ${NETLIFY_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          data: {
            type: 'CNAME',
            hostname: fullDomain, // e.g. tinuke-spa.sqale.shop
            value: NETLIFY_DNS_TARGET, // e.g. your-site-name.netlify.app or app.sqale.shop
            ttl: 3600,
          },
        });
        console.log('DNS record created in Netlify DNS for premium domain:', fullDomain);
      } catch (netlifyError) {
        // If the domain already exists on Netlify, treat this as success
        const status = netlifyError?.response?.status;
        const data = netlifyError?.response?.data;
        const message = typeof data === 'string' ? data : data?.message || '';

        const alreadyExists =
          status === 422 ||
          status === 409 ||
          (typeof message === 'string' &&
            message.toLowerCase().includes('already exists'));

        if (!alreadyExists) {
          throw netlifyError;
        }

        console.warn(
          'Netlify domain already exists, treating as success:',
          fullDomain
        );
      }

      // If we reach here, consider domain active
      store.customDomain = fullDomain;
      store.premiumDomainStatus = 'active';
      store.premiumDomainActivatedAt = new Date();
      store.premiumDomainError = undefined;
      await store.save();

      return res.json({
        premiumDomain: store.customDomain,
        status: store.premiumDomainStatus,
      });
    } catch (err) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      console.error('Error configuring premium domain:', {
        status,
        data,
        message: err?.message,
      });
      store.premiumDomainStatus = 'failed';
      store.premiumDomainError =
        (err && err.response && err.response.data && err.response.data.message) ||
        err.message ||
        'Failed to configure premium domain';
      await store.save();

      throw new AppError('Failed to configure premium domain. Please try again or contact support.', 500);
    }
  } catch (error) {
    next(error);
  }
};

// Get Store Settings (all sections)
exports.getStoreSettings = async (req, res, next) => {
  try {
    // Get user profile
    const user = await User.findById(req.user._id, 'name email whatsappNumber');
    
    // Find the store owned by the user
    const store = await Store.findById(req.store._id);
    
    if (!store) {
      throw new AppError('Store not found', 404);
    }

    // Managers are handled by a separate endpoint for pagination
    
    res.json({
      profile: user,
      storeDetails: {
        storeName: store.storeName,
        businessName: store.businessName,
        businessType: store.businessType,
        whatsappNumber: store.whatsappNumber,
        currency: store.currency,
        address: store.address,
        socialLinks: store.socialLinks,
        businessHours: store.businessHours,
        businessDescription: store.businessDescription,
        seo: store.seo,
        logo: store.logo,
        url: store.url,
        customDomain: store.customDomain,
        premiumDomainStatus: store.premiumDomainStatus,
      },
      checkoutOptions: store.checkoutOptions || {},
      customization: store.customization || {},
      bookingSettings: store.bookingSettings || { enabled: false }
    });
  } catch (error) {
    next(error);
  }
}; 