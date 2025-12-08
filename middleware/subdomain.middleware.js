const Business = require('../models/business.model');
const DomainUtils = require('../utils/domain.utils');
const { AppError } = require('./error.middleware');

exports.handleSubdomain = async (req, res, next) => {
  try {
    const hostname = req.hostname;
    const isStorefront = DomainUtils.isStorefrontDomain(hostname);
    
    if (isStorefront) {
      const subdomain = DomainUtils.getSubdomain(hostname);
      const business = await Business.findOne({ subdomain });
      
      if (!business) {
        throw new AppError('Business not found', 404);
      }
      
      req.business = business;
      req.isStorefront = true;
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

exports.requireStorefront = (req, res, next) => {
  if (!req.isStorefront) {
    return res.status(404).json({ message: 'Not found' });
  }
  next();
};

exports.preventStorefront = (req, res, next) => {
  if (req.isStorefront) {
    return res.status(400).json({ message: 'This endpoint is not available on store subdomains' });
  }
  next();
}; 