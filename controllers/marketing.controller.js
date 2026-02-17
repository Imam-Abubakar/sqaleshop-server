const EmailCampaign = require('../models/email-campaign.model');
const User = require('../models/user.model');
const Customer = require('../models/customer.model');
const { AppError } = require('../utils/errors');
const { sendRawEmail } = require('../services/email.service');

// Get all email campaigns
const getAllCampaigns = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } }
      ];
    }

    const campaigns = await EmailCampaign.find(query)
      .populate('author', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await EmailCampaign.countDocuments(query);

    res.json({
      campaigns,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get single campaign
const getCampaignById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const campaign = await EmailCampaign.findById(id)
      .populate('author', 'name email');

    if (!campaign) {
      throw new AppError('Campaign not found', 404);
    }

    res.json(campaign);
  } catch (error) {
    next(error);
  }
};

// Create new campaign
const createCampaign = async (req, res, next) => {
  try {
    const campaignData = {
      ...req.body,
      author: req.user._id
    };

    const campaign = new EmailCampaign(campaignData);
    await campaign.save();

    await campaign.populate('author', 'name email');

    res.status(201).json(campaign);
  } catch (error) {
    next(error);
  }
};

// Update campaign
const updateCampaign = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const campaign = await EmailCampaign.findById(id);
    if (!campaign) {
      throw new AppError('Campaign not found', 404);
    }

    Object.assign(campaign, req.body);
    await campaign.save();

    await campaign.populate('author', 'name email');

    res.json(campaign);
  } catch (error) {
    next(error);
  }
};

// Delete campaign
const deleteCampaign = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const campaign = await EmailCampaign.findById(id);
    if (!campaign) {
      throw new AppError('Campaign not found', 404);
    }

    await EmailCampaign.findByIdAndDelete(id);

    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Send campaign
const sendCampaign = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const campaign = await EmailCampaign.findById(id);
    if (!campaign) {
      throw new AppError('Campaign not found', 404);
    }

    if (campaign.status !== 'draft') {
      throw new AppError('Only draft campaigns can be sent', 400);
    }

    // Get recipients based on recipientType
    let recipients = [];
    
    switch (campaign.recipientType) {
      case 'all_users':
        const allUsers = await User.find({}, 'email name');
        recipients = allUsers.map(user => ({ email: user.email, name: user.name }));
        break;
      case 'store_owners':
        const owners = await User.find({ role: 'owner' }, 'email name');
        recipients = owners.map(user => ({ email: user.email, name: user.name }));
        break;
      case 'managers':
        const managers = await User.find({ role: 'manager' }, 'email name');
        recipients = managers.map(user => ({ email: user.email, name: user.name }));
        break;
      case 'customers':
        const customers = await Customer.find({}, 'email name');
        recipients = customers.map(customer => ({ email: customer.email, name: customer.name }));
        break;
      case 'custom':
        recipients = campaign.customRecipients || [];
        break;
    }

    // Filter out recipients without valid email addresses
    const validRecipients = recipients.filter(r => r.email && r.email.trim());
    
    if (validRecipients.length === 0) {
      throw new AppError('No valid recipients found for this campaign', 400);
    }

    // Update campaign status
    campaign.status = 'sending';
    campaign.sentAt = new Date();
    campaign.stats.totalSent = validRecipients.length;
    await campaign.save();

    // Send emails to all recipients - using Promise.allSettled to ensure all emails are attempted
    // even if some fail
    const sendPromises = validRecipients.map(async (recipient) => {
      try {
        await sendRawEmail(
          recipient.email,
          campaign.subject,
          campaign.content
        );
        return { success: true, email: recipient.email };
      } catch (error) {
        console.error(`Failed to send campaign email to ${recipient.email}:`, error.message);
        return { success: false, email: recipient.email, error: error.message };
      }
    });

    // Wait for all emails to be sent (or fail) - Promise.allSettled ensures we continue even if some fail
    const results = await Promise.allSettled(sendPromises);

    // Count successful and failed deliveries from results
    let delivered = 0;
    let bounced = 0;
    
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.success) {
        delivered++;
      } else {
        bounced++;
        // Log the specific error for this email
        const email = result.value?.email || 'unknown';
        const error = result.value?.error || result.reason?.message || 'Unknown error';
        console.error(`Email to ${email} bounced: ${error}`);
      }
    });

    // Update campaign stats and status
    campaign.status = 'sent';
    campaign.stats.delivered = delivered;
    campaign.stats.bounced = bounced;
    await campaign.save();

    res.json({ 
      message: 'Campaign sent successfully',
      recipientsCount: validRecipients.length,
      delivered,
      bounced,
      campaign: campaign
    });
  } catch (error) {
    next(error);
  }
};

// Get campaign analytics
const getCampaignAnalytics = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const campaign = await EmailCampaign.findById(id);
    if (!campaign) {
      throw new AppError('Campaign not found', 404);
    }

    // Calculate rates
    const deliveryRate = campaign.stats.totalSent > 0 
      ? (campaign.stats.delivered / campaign.stats.totalSent) * 100 
      : 0;
    
    const openRate = campaign.stats.delivered > 0 
      ? (campaign.stats.opened / campaign.stats.delivered) * 100 
      : 0;
    
    const clickRate = campaign.stats.delivered > 0 
      ? (campaign.stats.clicked / campaign.stats.delivered) * 100 
      : 0;

    res.json({
      campaign: {
        id: campaign._id,
        name: campaign.name,
        subject: campaign.subject,
        sentAt: campaign.sentAt,
        status: campaign.status
      },
      stats: {
        ...campaign.stats,
        deliveryRate: Math.round(deliveryRate * 100) / 100,
        openRate: Math.round(openRate * 100) / 100,
        clickRate: Math.round(clickRate * 100) / 100
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get all campaigns analytics summary
const getCampaignsAnalytics = async (req, res, next) => {
  try {
    const campaigns = await EmailCampaign.find({ status: 'sent' });
    
    const totalStats = campaigns.reduce((acc, campaign) => {
      acc.totalSent += campaign.stats.totalSent;
      acc.delivered += campaign.stats.delivered;
      acc.opened += campaign.stats.opened;
      acc.clicked += campaign.stats.clicked;
      acc.bounced += campaign.stats.bounced;
      acc.unsubscribed += campaign.stats.unsubscribed;
      return acc;
    }, {
      totalSent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      unsubscribed: 0
    });

    const overallDeliveryRate = totalStats.totalSent > 0 
      ? (totalStats.delivered / totalStats.totalSent) * 100 
      : 0;
    
    const overallOpenRate = totalStats.delivered > 0 
      ? (totalStats.opened / totalStats.delivered) * 100 
      : 0;
    
    const overallClickRate = totalStats.delivered > 0 
      ? (totalStats.clicked / totalStats.delivered) * 100 
      : 0;

    res.json({
      totalCampaigns: campaigns.length,
      stats: {
        ...totalStats,
        deliveryRate: Math.round(overallDeliveryRate * 100) / 100,
        openRate: Math.round(overallOpenRate * 100) / 100,
        clickRate: Math.round(overallClickRate * 100) / 100
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  sendCampaign,
  getCampaignAnalytics,
  getCampaignsAnalytics
};
