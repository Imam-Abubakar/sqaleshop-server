const Business = require('../models/business.model');
const User = require('../models/user.model');
const Template = require('../models/template.model');
const slugify = require('slugify');
const { AppError } = require('../middleware/error.middleware');

exports.updateBusinessInfo = async (req, res, next) => {
  try {
    const { name, businessType, contactPhone } = req.body;
    const userId = req.user.id;

    const business = await Business.create({
      name,
      businessType,
      contactPhone,
      ownerId: userId,
      subdomain: slugify(name, { lower: true }),
    });

    await User.findByIdAndUpdate(userId, {
      onboardingStatus: 'template_selection',
      name: name, // Set user's name from business name
    });

    res.status(201).json({ business });
  } catch (error) {
    next(error);
  }
};

exports.getTemplates = async (req, res, next) => {
  try {
    const { businessType } = req.query;
    const templates = await Template.find({
      industry: businessType,
      isActive: true,
    });
    res.json({ templates });
  } catch (error) {
    next(error);
  }
};

exports.selectTemplate = async (req, res, next) => {
  try {
    const { templateId } = req.body;
    const userId = req.user.id;

    const template = await Template.findById(templateId);
    if (!template) {
      throw new AppError('Template not found', 404);
    }

    const business = await Business.findOne({ ownerId: userId });
    if (!business) {
      throw new AppError('Business not found', 404);
    }

    // Apply template settings to business
    business.settings = template.settings;
    await business.save();

    await User.findByIdAndUpdate(userId, {
      onboardingStatus: 'domain_setup'
    });

    res.json({ business });
  } catch (error) {
    next(error);
  }
};

exports.setupDomain = async (req, res, next) => {
  try {
    const { customDomain, useSubdomain } = req.body;
    const userId = req.user.id;

    const business = await Business.findOne({ ownerId: userId });
    if (!business) {
      throw new AppError('Business not found', 404);
    }

    if (customDomain) {
      business.customDomain = customDomain;
    }

    if (useSubdomain) {
      // Subdomain is already set during business creation
      business.useSubdomain = true;
    }

    await business.save();

    await User.findByIdAndUpdate(userId, {
      onboardingStatus: 'completed'
    });

    res.json({ business });
  } catch (error) {
    next(error);
  }
}; 