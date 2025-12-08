const Store = require('../models/store.model');
const errorMiddleware = require('./error.middleware');
const AppError = errorMiddleware.AppError;

/**
 * Middleware to validate if user has access to a store
 * Sets req.store and req.isStoreOwner
 */
exports.validateStoreAccess = async (req, res, next) => {
  try {
    const storeId = req.headers['store-id'] || req.headers['Store-ID'] || req.params.storeId;
    
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const userId = req.user._id;
    
    if (!storeId) {
      return next(new AppError('Store ID not provided', 400));
    }
    
    const store = await Store.findById(storeId);
    
    if (!store) {
      return next(new AppError('Store not found', 404));
    }
    
    // Check if user is the owner or a manager
    const isOwner = store.owner.toString() === userId.toString();
    const isManager = store.managers && store.managers.some(id => id.toString() === userId.toString());
    
    if (!isOwner && !isManager) {
      return next(new AppError('You do not have access to this store', 403));
    }
    
    // Get manager permissions if applicable
    let permissions = [];
    if (isManager) {
      permissions = store.managerPermissions && 
        store.managerPermissions.get(userId.toString()) || [];
    }
    
    // Set store info on the request object
    req.store = store;
    req.isStoreOwner = isOwner;
    req.storePermissions = isOwner ? ['*'] : permissions;
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to validate if user is the store owner
 * Must be used after validateStoreAccess
 */
exports.validateStore = async (req, res, next) => {
  try {
    const storeId = req.headers['store-id'] || req.headers['Store-ID'] || req.params.storeId;
    
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    
    const userId = req.user._id;
    
    if (!storeId) {
      return next(new AppError('Store ID not provided', 400));
    }
    
    const store = await Store.findById(storeId);
    
    if (!store) {
      return next(new AppError('Store not found', 404));
    }
    
    // Check if user is the owner
    if (store.owner.toString() !== userId.toString()) {
      return next(new AppError('Only store owners can perform this action', 403));
    }
    
    // Set store on the request object
    req.store = store;
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to validate if a manager has specific permission
 * Must be used after validateStoreAccess
 * 
 * @param {string} permission - Required permission
 * @returns {Function} Middleware function
 */
exports.validatePermission = (permission) => {
  return (req, res, next) => {
    // Store owners have all permissions
    if (req.isStoreOwner) {
      return next();
    }
    
    // Check if manager has the required permission
    if (!req.storePermissions || !req.storePermissions.includes(permission)) {
      return next(new AppError(`You do not have ${permission} permission for this store`, 403));
    }
    
    next();
  };
}; 