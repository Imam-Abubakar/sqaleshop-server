const Business = require('../models/business.model');
const cloudinary = require('../services/cloudinary.service');

exports.createBusiness = async (req, res) => {
  try {
    const { name } = req.body;
    
    const business = await Business.create({
      name,
      ownerId: req.user._id,
    });

    res.status(201).json(business);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getBusinesses = async (req, res) => {
  try {
    const businesses = await Business.find({ ownerId: req.user._id });
    res.status(200).json(businesses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getBusiness = async (req, res) => {
  try {
    const business = await Business.findOne({
      _id: req.params.id,
      ownerId: req.user._id,
    });

    if (!business) {
      return res.status(404).json({ message: 'Business not found' });
    }

    res.status(200).json(business);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateBusiness = async (req, res) => {
  try {
    const { name, settings } = req.body;
    const business = await Business.findOne({
      _id: req.params.id,
      ownerId: req.user._id,
    });

    if (!business) {
      return res.status(404).json({ message: 'Business not found' });
    }

    if (name) business.name = name;
    if (settings) business.settings = { ...business.settings, ...settings };

    // Handle logo upload if included
    if (req.file) {
      // Convert buffer to base64 for Cloudinary upload
      const base64Data = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      const result = await cloudinary.uploadBase64(base64Data);
      business.settings.logo = result.url;
    }

    await business.save();
    res.status(200).json(business);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteBusiness = async (req, res) => {
  try {
    const business = await Business.findOneAndDelete({
      _id: req.params.id,
      ownerId: req.user._id,
    });

    if (!business) {
      return res.status(404).json({ message: 'Business not found' });
    }

    res.status(200).json({ message: 'Business deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateDomain = async (req, res) => {
  try {
    const { customDomain } = req.body;
    const business = await Business.findOne({
      _id: req.params.id,
      ownerId: req.user._id,
    });

    if (!business) {
      return res.status(404).json({ message: 'Business not found' });
    }

    business.customDomain = customDomain;
    await business.save();

    res.status(200).json(business);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}; 