const Service = require('../models/service.model');

exports.createService = async (req, res) => {
  try {
    const { name, description, duration, price, availability } = req.body;

    const service = await Service.create({
      businessId: req.store._id,
      name,
      description,
      duration,
      price,
      availability,
    });

    res.status(201).json(service);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getServices = async (req, res) => {
  try {
    const services = await Service.find({ businessId: req.store._id });
    res.status(200).json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getService = async (req, res) => {
  try {
    const service = await Service.findOne({
      _id: req.params.id,
      businessId: req.store._id,
    });

    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    res.status(200).json(service);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateService = async (req, res) => {
  try {
    const { name, description, duration, price, availability, status } = req.body;
    const service = await Service.findOne({
      _id: req.params.id,
      businessId: req.store._id,
    });

    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    if (name) service.name = name;
    if (description) service.description = description;
    if (duration) service.duration = duration;
    if (price) service.price = price;
    if (availability) service.availability = availability;
    if (status) service.status = status;

    await service.save();
    res.status(200).json(service);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteService = async (req, res) => {
  try {
    const service = await Service.findOneAndDelete({
      _id: req.params.id,
      businessId: req.store._id,
    });

    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    res.status(200).json({ message: 'Service deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}; 