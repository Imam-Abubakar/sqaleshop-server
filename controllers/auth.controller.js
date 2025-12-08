const User = require('../models/user.model');
const { AuthenticationError, ValidationError } = require('../utils/errors');
const { sendMagicLinkEmail, sendWelcomeEmail } = require('../services/email.service');
const jwt = require('jsonwebtoken');
const Store = require('../models/store.model');
const cloudinary = require('../services/cloudinary.service');

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '180d',
  });
};

const requestMagicLink = async (req, res, next) => {
  try {
    const { email } = req.body;
    
    let user = await User.findOne({ email: email.toLowerCase() });
    const isNewUser = !user;
    
    if (!user) {
      user = await User.create({
        email: email.toLowerCase(),
        role: 'owner',
      });
    }

    const code = user.createMagicCode();
    await user.save();

    // Send verification code email
    await sendMagicLinkEmail(email, code);

    res.json({ 
      message: 'Verification code sent successfully',
      isNewUser 
    });
  } catch (error) {
    next(error);
  }
};

const verifyMagicLink = async (req, res, next) => {
  try {
    const { email, code, businessData = {} } = req.body;
    
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    if (!user.verifyMagicCode(code)) {
      throw new AuthenticationError('Invalid or expired code');
    }

    // Check if user is an owner of a store
    const ownedStore = await Store.findOne({ owner: user._id });
    
    // Check if user is a manager of any store
    const managedStore = await Store.findOne({ managers: user._id.toString() });
    
    // Set onboarding status based on user role and store existence
    if (user.role === 'manager' || managedStore) {
      // Managers should always skip onboarding
      user.onboardingStatus = 'completed';
      
      // Update role to manager if not already set
      if (user.role !== 'manager' && user.role !== 'owner') {
        user.role = 'manager';
      }
    } else if (ownedStore) {
      // Store owners with existing stores are completed
      user.onboardingStatus = 'completed';
    } else {
      // New owners without stores need to complete onboarding
      user.onboardingStatus = 'pending';
    }
    
    // Clear magic link code after successful verification
    if (businessData && typeof businessData === 'object') {
      user.whatsappNumber = businessData.whatsappNumber || user.whatsappNumber;
      user.name = businessData.name || user.name;
    }
    user.magicLink = undefined;
    user.lastLoginAt = new Date();
    await user.save();

    // Send welcome email for new users
    if (!ownedStore && !managedStore && user.name) {
      try {
        await sendWelcomeEmail(user.email, user.name);
      } catch (emailError) {
        console.error('Error sending welcome email:', emailError);
        // Continue with login even if email fails
      }
    }

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        onboardingStatus: user.onboardingStatus,
        plan: user.plan
      }
    });
  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-magicLink');
    
    let storePermissions = null;
    
    // If user is a manager, fetch their managed store info to get permissions
    if (user.role === 'manager') {
      const Store = require('../models/store.model');
      
      // Find stores where user is a manager
      const managedStores = await Store.find({ 
        managers: { $in: [user._id.toString()] } 
      }, {
        storeName: 1,
        businessName: 1,
        managerPermissions: 1,
        owner: 1
      });
      
      if (managedStores.length > 0) {
        // Get the first managed store's permissions (typically managers only manage one store)
        const store = managedStores[0];
        storePermissions = {
          storeId: store._id,
          storeName: store.storeName || store.businessName,
          permissions: store.managerPermissions && 
                      store.managerPermissions.get(user._id.toString()) || [],
          isOwner: false,
          owner: store.owner.toString()
        };
      }
    }
    
    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      onboardingStatus: user.onboardingStatus,
      plan: user.plan,
      storePermissions: storePermissions
    });
  } catch (error) {
    console.error('Error in getMe:', error);
    res.status(500).json({ message: 'Error retrieving user data' });
  }
};

const logout = async (req, res) => {
  res.json({ message: 'Logged out successfully' });
};

const updateProfile = async (req, res, next) => {
  try {
    const { name, email } = req.body;
    const user = await User.findById(req.user._id);

    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        throw new AuthenticationError('Email already in use');
      }
      user.email = email.toLowerCase();
    }

    if (name) user.name = name;
    await user.save();

    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      onboardingStatus: user.onboardingStatus,
      plan: user.plan
    });
  } catch (error) {
    next(error);
  }
};

// List of reserved routes that cannot be used as store URLs
const RESERVED_ROUTES = [
  // App pages
  'login',
  'register',
  'forgot-password',
  'onboarding',
  'dashboard',
  'admin',
  
  // Landing pages
  'features',
  'pricing',
  'templates',
  'blog',
  'contact',
  'about',
  'enterprise',
  
  // Legal pages
  'privacy',
  'terms',
  'cookies',

  // System reserved
  'api',
  'auth',
  'cdn',
  'app',
  'www',
  'help',
  'support',
  'shop',
  'store',
  'static',
  'media',
  'assets',
  'images',
  'img',
  'css',
  'js',
  'docs',
  'documentation',
  'settings',
  'account',
  'profile',
  'payment',
  'checkout',
  'cart',
];

// Validate store URL (for server-side safety)
function validateStoreUrl(url) {
  // Check for reserved routes
  if (RESERVED_ROUTES.includes(url)) {
    return false;
  }
  
  // Check for valid characters (letters, numbers, hyphens)
  if (!/^[a-z0-9-]+$/.test(url)) {
    return false;
  }
  
  // Check if URL starts or ends with hyphen
  if (url.startsWith('-') || url.endsWith('-')) {
    return false;
  }
  
  return true;
}

const completeOnboarding = async (req, res, next) => {
  try {
    // Parse goals if it's a JSON string (from FormData)
    if (req.body.goals && typeof req.body.goals === 'string') {
      try {
        req.body.goals = JSON.parse(req.body.goals);
      } catch (e) {
        req.body.goals = [];
      }
    }

    const { 
      // Store Information (Step 3)
      url, 
      storeName,
      whatsappNumber, 
      currency,
      
      // Business Details (Step 1)
      businessName,
      businessType, 
      numberOfEmployees,
      monthlyOrders,
      referralSource,
      
      // Goals (Step 2)
      goals,
      
      // Logo as base64 data
      logoBase64
    } = req.body;
    
    // Validate URL to ensure it's not a reserved route (server-side validation)
    if (!validateStoreUrl(url)) {
      throw new ValidationError('Store URL is invalid or uses a reserved name');
    }
    
    // Check if store URL is already taken
    const existingStore = await Store.findOne({ url });
    if (existingStore) {
      throw new ValidationError('Store URL is already taken');
    }

    // Handle logo upload if base64 data is provided
    let logoUrl = '';
    if (logoBase64) {
      // Upload directly using base64 data
      const cloudinaryResult = await cloudinary.uploadBase64(logoBase64, 'store-logos');
      logoUrl = cloudinaryResult.url;
    }

    // Create store with all the data from the 3 steps
    const store = await Store.create({
      // Store Information
      url,
      storeName,
      logo: logoUrl,
      whatsappNumber,
      currency,
      
      // Business Details
      businessName,
      businessType,
      numberOfEmployees,
      monthlyOrders,
      referralSource,
      
      // Goals
      goals,
      
      // Store Customization with default template
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
      
      // Owner relationship
      owner: req.user._id
    });

    // Update user's onboarding status and name from business data
    req.user.onboardingStatus = 'completed';
    // Update user's name from business name if not already set
    if (businessName && !req.user.name) {
      req.user.name = businessName;
    }
    await req.user.save();

    res.status(201).json(store);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  requestMagicLink,
  verifyMagicLink,
  getMe,
  logout,
  updateProfile,
  completeOnboarding
};