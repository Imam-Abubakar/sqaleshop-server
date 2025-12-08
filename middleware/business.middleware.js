const Business = require('../models/business.model');

exports.verifyBusinessOwnership = async (req, res, next) => {
  try {
    const business = await Business.findOne({
      _id: req.params.businessId,
      ownerId: req.user._id,
    });

    if (!business) {
      return res.status(403).json({ message: 'Not authorized to access this business' });
    }

    req.business = business;
    next();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}; 