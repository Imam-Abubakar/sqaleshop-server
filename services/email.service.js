const nodemailer = require('nodemailer');
const hbs = require('handlebars');
const fs = require('fs').promises;
const path = require('path');
const Business = require('../models/business.model');
const User = require('../models/user.model');

// Support both legacy EMAIL_* env vars (as documented) and SMTP_* variants
const mailHost = process.env.SMTP_HOST || process.env.EMAIL_HOST;
const mailPort = Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 587);
const mailUser = process.env.SMTP_USER || process.env.EMAIL_USER;
const mailPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
const mailFrom = process.env.EMAIL_FROM || '"Sqaleshop" <no-reply@sqaleshop.com>';

const transporter = nodemailer.createTransport({
  host: mailHost,
  port: mailPort,
  secure: mailPort === 465, // true for 465, false for 587 and others
  auth: mailUser && mailPass ? {
    user: mailUser,
    pass: mailPass,
  } : undefined,
});

// Register common Handlebars helpers used in email templates
hbs.registerHelper('multiply', (a, b) => {
  const numA = Number(a) || 0;
  const numB = Number(b) || 0;
  return (numA * numB).toFixed(2);
});

hbs.registerHelper('eq', (a, b) => a === b);
hbs.registerHelper('gt', (a, b) => Number(a) > Number(b));
hbs.registerHelper('lt', (a, b) => Number(a) < Number(b));

const sendEmail = async (to, subject, template, context) => {
  if (!to) {
    return;
  }

  const templatePath = path.join(__dirname, '../templates/emails', `${template}.hbs`);
  const templateContent = await fs.readFile(templatePath, 'utf-8');
  const compiledTemplate = hbs.compile(templateContent);
  const html = compiledTemplate(context);

  await transporter.sendMail({
    from: mailFrom,
    to,
    subject,
    html,
  });
};

/**
 * Send raw HTML email without using a template
 * Useful for campaign emails where content is stored in the database
 */
const sendRawEmail = async (to, subject, html) => {
  if (!to) {
    return;
  }

  await transporter.sendMail({
    from: mailFrom,
    to,
    subject,
    html,
  });
};

/**
 * Build the common context object used by order-related email templates
 */
const buildOrderEmailContext = async (order, store, extra = {}) => {
  // Load business for branding/settings if available
  let business = null;
  if (order.businessId) {
    try {
      business = await Business.findById(order.businessId).lean();
    } catch (e) {
      // Fail silently and fall back to store data
      console.error('Failed to load business for email context:', e);
    }
  }

  // Fallback business data from store if business record is not found
  if (!business && store) {
    business = {
      name: store.businessName || store.storeName || 'Your Store',
      settings: {
        logo: store.logo,
        ...(store.settings || {}),
      },
    };
  }

  // Determine currency from store (fallback to NGN)
  const currencyCode = (store && store.currency) || 'NGN';
  const currencySymbolMap = {
    NGN: '₦',
    USD: '$',
    EUR: '€',
    GBP: '£',
    GHS: '₵',
  };
  const currencySymbol = currencySymbolMap[currencyCode] || currencyCode;

  // Normalize items for templates – ensure product.name and price fields exist
  const items = (order.items || []).map((item) => {
    const plainItem = item.toObject ? item.toObject() : item;
    const productName =
      plainItem.productSnapshot?.name ||
      plainItem.product?.name ||
      'Product';

    const unitPrice =
      plainItem.unitPrice != null
        ? plainItem.unitPrice
        : plainItem.price != null
          ? plainItem.price
          : 0;

    return {
      ...plainItem,
      product: {
        ...(plainItem.product || {}),
        name: productName,
      },
      quantity: plainItem.quantity,
      price: unitPrice,
    };
  });

  const pricing = order.pricing || {};
  const shipping = order.shipping || {};

  return {
    year: new Date().getFullYear(),
    business,
    currencyCode,
    currencySymbol,
    order: {
      orderNumber: order.orderNumber,
      items,
      customer: order.customer,
      subtotal: pricing.subtotal,
      tax: pricing.tax,
      shipping: {
        cost: pricing.shipping ?? shipping.cost,
        address: shipping.address || {},
      },
      discount: order.discount || null,
      total: pricing.total,
      paymentStatus: order.payment?.status,
      refund: extra.refund || null,
    },
    invoiceUrl: extra.invoiceUrl || null,
    ...extra,
  };
};

/**
 * Send order confirmation email to both customer and store owner
 */
const sendOrderConfirmation = async (order, store, options = {}) => {
  if (!order) return;

  const { invoiceUrl } = options;

  const customerContext = await buildOrderEmailContext(order, store, {
    invoiceUrl,
  });
  const subject = `Order Confirmation - #${order.orderNumber || ''}`.trim();

  const sendPromises = [];

  // Send to customer (if email provided)
  if (order.customer?.email) {
    sendPromises.push(
      sendEmail(order.customer.email, subject, 'order-confirmation', customerContext)
    );
  }

  // Send to store owner (if notifications enabled and owner email exists)
  try {
    let business = null;
    if (order.businessId) {
      business = await Business.findById(order.businessId).lean();
    }

    const emailNotificationsEnabled =
      business?.settings?.notifications?.email !== false;

    if (emailNotificationsEnabled && store?.owner) {
      const owner = await User.findById(store.owner).lean();
      if (owner?.email) {
        const ownerSubject = `New Order Received - #${order.orderNumber || ''}`.trim();
        const ownerContext = await buildOrderEmailContext(order, store, {
          invoiceUrl,
          isOwner: true,
        });
        sendPromises.push(
          sendEmail(owner.email, ownerSubject, 'order-confirmation-owner', ownerContext)
        );
      }
    }
  } catch (e) {
    console.error('Failed to send order confirmation to store owner:', e);
  }

  await Promise.allSettled(sendPromises);
};

/**
 * Send order status update email to customer (and optionally owner for key statuses)
 */
const sendOrderStatusUpdate = async (order, store, oldStatus) => {
  if (!order) return;

  const context = await buildOrderEmailContext(order, store, { oldStatus });
  const prettyStatus = (order.status || '').charAt(0).toUpperCase() + (order.status || '').slice(1);
  const subject = `Order #${order.orderNumber || ''} ${prettyStatus}`.trim();

  const sendPromises = [];

  // For delivered/shipped we have dedicated templates
  let template = 'order-confirmation';
  if (order.status === 'shipped') {
    template = 'order-shipped';
  } else if (order.status === 'delivered') {
    template = 'order-delivered';
  }

  if (order.customer?.email) {
    sendPromises.push(
      sendEmail(order.customer.email, subject, template, context)
    );
  }

  // Optionally notify owner for important status changes
  if (order.status === 'shipped' || order.status === 'delivered') {
    try {
      let business = null;
      if (order.businessId) {
        business = await Business.findById(order.businessId).lean();
      }
      const emailNotificationsEnabled =
        business?.settings?.notifications?.email !== false;

      if (emailNotificationsEnabled && store?.owner) {
        const owner = await User.findById(store.owner).lean();
        if (owner?.email) {
          const ownerSubject = `Order #${order.orderNumber || ''} ${prettyStatus}`.trim();
          sendPromises.push(
            sendEmail(owner.email, ownerSubject, template, context)
          );
        }
      }
    } catch (e) {
      console.error('Failed to send order status update to store owner:', e);
    }
  }

  await Promise.allSettled(sendPromises);
};

/**
 * Send order cancellation email to customer and notify owner
 */
const sendOrderCancellation = async (order, store, reason) => {
  if (!order) return;

  const pricing = order.pricing || {};
  const extra = {
    cancellationReason: reason || '',
  };

  // Embed simple refund/payment info expected by template
  extra.refund = {
    amount: pricing.total,
    reason: reason || 'Order cancelled',
  };

  const context = await buildOrderEmailContext(order, store, extra);
  const subject = `Order Cancelled - #${order.orderNumber || ''}`.trim();

  const sendPromises = [];

  if (order.customer?.email) {
    sendPromises.push(
      sendEmail(order.customer.email, subject, 'order-cancelled', context)
    );
  }

  try {
    let business = null;
    if (order.businessId) {
      business = await Business.findById(order.businessId).lean();
    }
    const emailNotificationsEnabled =
      business?.settings?.notifications?.email !== false;

    if (emailNotificationsEnabled && store?.owner) {
      const owner = await User.findById(store.owner).lean();
      if (owner?.email) {
        const ownerSubject = `Order Cancelled - #${order.orderNumber || ''}`.trim();
        sendPromises.push(
          sendEmail(owner.email, ownerSubject, 'order-cancelled', context)
        );
      }
    }
  } catch (e) {
    console.error('Failed to send order cancellation to store owner:', e);
  }

  await Promise.allSettled(sendPromises);
};

/**
 * Send refund confirmation email to customer and notify owner
 */
const sendRefundConfirmation = async (order, store, amount, reason) => {
  if (!order) return;

  const extra = {
    refund: {
      amount,
      reason: reason || '',
    },
  };

  const context = await buildOrderEmailContext(order, store, extra);
  const subject = `Refund Processed - Order #${order.orderNumber || ''}`.trim();

  const sendPromises = [];

  if (order.customer?.email) {
    sendPromises.push(
      sendEmail(order.customer.email, subject, 'order-refunded', context)
    );
  }

  try {
    let business = null;
    if (order.businessId) {
      business = await Business.findById(order.businessId).lean();
    }
    const emailNotificationsEnabled =
      business?.settings?.notifications?.email !== false;

    if (emailNotificationsEnabled && store?.owner) {
      const owner = await User.findById(store.owner).lean();
      if (owner?.email) {
        const ownerSubject = `Refund Processed - Order #${order.orderNumber || ''}`.trim();
        sendPromises.push(
          sendEmail(owner.email, ownerSubject, 'order-refunded', context)
        );
      }
    }
  } catch (e) {
    console.error('Failed to send refund confirmation to store owner:', e);
  }

  await Promise.allSettled(sendPromises);
};

const sendMagicLinkEmail = async (email, code) => {
  await sendEmail(
    email,
    'Your Verification Code - Sqaleshop',
    'magic-link',
    { code }
  );
};

const sendEmailChangeVerification = async (email, otp) => {
  await sendEmail(
    email,
    'Verify Your New Email Address - Sqaleshop',
    'email-change-verification',
    { otp }
  );
};

const sendWelcomeEmail = async (email, businessName) => {
  await sendEmail(
    email,
    'Welcome to Sqaleshop!',
    'welcome',
    { 
      businessName,
      year: new Date().getFullYear(),
      clientUrl: process.env.CLIENT_URL
    }
  );
};

const sendManagerInvitationEmail = async (email, storeName, permissions) => {
  const permissionLabels = {
    dashboard: 'Dashboard',
    products: 'Products',
    orders: 'Orders',
    customers: 'Customers',

    analytics: 'Analytics',
    settings: 'Settings'
  };
  
  const permissionList = permissions.map(p => permissionLabels[p] || p).join(', ');
  
  await sendEmail(
    email,
    `You've been invited to manage ${storeName}`,
    'manager-invitation',
    { 
      storeName,
      permissions: permissionList,
      loginUrl: `${process.env.CLIENT_URL}/auth/login`,
      year: new Date().getFullYear()
    }
  );
};

const sendManagerPermissionUpdateEmail = async (email, storeName, permissions) => {
  const permissionLabels = {
    dashboard: 'Dashboard',
    products: 'Products',
    orders: 'Orders',
    customers: 'Customers',

    analytics: 'Analytics',
    settings: 'Settings'
  };
  
  const permissionList = permissions.map(p => permissionLabels[p] || p).join(', ');
  
  await sendEmail(
    email,
    `Your permissions for ${storeName} have been updated`,
    'manager-permission-update',
    { 
      storeName,
      permissions: permissionList,
      loginUrl: `${process.env.CLIENT_URL}/auth/login`,
      year: new Date().getFullYear()
    }
  );
};

/**
 * Build booking email context
 */
const buildBookingEmailContext = async (booking, store, extra = {}) => {
  const slot = booking.slot?.snapshot || {};
  const customer = booking.customer || {};
  const pricing = booking.pricing || {};
  const bookingDetails = booking.bookingDetails || {};

  // Format dates
  const formatDate = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      weekday: 'long'
    });
  };

  const formatDateTime = (date, time) => {
    if (!date) return '';
    const dateStr = formatDate(date);
    return time ? `${dateStr} at ${time}` : dateStr;
  };

  // Format currency
  const formatCurrency = (amount, currency = 'NGN') => {
    const currencySymbols = {
      NGN: '₦',
      USD: '$',
      EUR: '€',
      GBP: '£',
      GHS: '₵',
    };
    const symbol = currencySymbols[currency] || currency;
    return `${symbol}${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return {
    bookingNumber: booking.bookingNumber || '',
    // Customer details
    customerName: customer.name || '',
    customerEmail: customer.email || '',
    customerPhone: customer.phone || '',
    customerAddress: customer.address || '',
    // Slot details
    slotName: slot.name || '',
    slotDescription: slot.description || '',
    bookingType: slot.bookingType || '',
    duration: slot.duration || '',
    capacity: slot.capacity || 1,
    slotImages: slot.images || [],
    // Booking schedule
    startDate: formatDate(bookingDetails.startDate),
    endDate: formatDate(bookingDetails.endDate),
    startDateTime: formatDateTime(bookingDetails.startDate, bookingDetails.startTime),
    endDateTime: formatDateTime(bookingDetails.endDate, bookingDetails.endTime),
    startTime: bookingDetails.startTime || '',
    endTime: bookingDetails.endTime || '',
    quantity: bookingDetails.quantity || 1,
    // Pricing
    subtotal: pricing.subtotal || 0,
    tax: pricing.tax || 0,
    discount: pricing.discount || 0,
    total: pricing.total || 0,
    currency: pricing.currency || 'NGN',
    formattedSubtotal: formatCurrency(pricing.subtotal || 0, pricing.currency || 'NGN'),
    formattedTax: formatCurrency(pricing.tax || 0, pricing.currency || 'NGN'),
    formattedDiscount: formatCurrency(pricing.discount || 0, pricing.currency || 'NGN'),
    formattedTotal: formatCurrency(pricing.total || 0, pricing.currency || 'NGN'),
    // Payment
    paymentMethod: booking.payment?.method || '',
    paymentStatus: booking.payment?.status || 'pending',
    paymentAmount: booking.payment?.amount || pricing.total || 0,
    formattedPaymentAmount: formatCurrency(booking.payment?.amount || pricing.total || 0, pricing.currency || 'NGN'),
    // Status
    status: booking.status || 'pending',
    oldStatus: extra.oldStatus || '',
    // Store details
    storeName: store.storeName || store.businessName || '',
    storeLogo: store.logo || '',
    storeAddress: store.address ? `${store.address.street || ''}, ${store.address.city || ''}, ${store.address.state || ''}, ${store.address.country || ''}`.replace(/^,\s*|,\s*$/g, '') : '',
    storePhone: store.whatsappNumber || '',
    // Notes
    notes: booking.notes?.customer || '',
    internalNotes: booking.notes?.internal || '',
    // Metadata
    year: new Date().getYear() + 1900,
    bookingDate: formatDate(booking.createdAt),
    ...extra,
  };
};

/**
 * Send booking confirmation email to both customer and store owner
 */
const sendBookingConfirmation = async (booking, store) => {
  if (!booking) return;

  const customerContext = await buildBookingEmailContext(booking, store);
  const subject = `Booking Confirmation - #${booking.bookingNumber || ''}`.trim();

  const sendPromises = [];

  // Send to customer (if email provided)
  if (booking.customer?.email) {
    sendPromises.push(
      sendEmail(booking.customer.email, subject, 'booking-confirmation', customerContext)
    );
  }

  // Send to store owner (if notifications enabled and owner email exists)
  try {
    const business = await Business.findById(store.owner).lean();
    const emailNotificationsEnabled =
      business?.settings?.notifications?.email !== false;

    if (emailNotificationsEnabled && store?.owner) {
      const owner = await User.findById(store.owner).lean();
      if (owner?.email) {
        const ownerSubject = `New Booking Received - #${booking.bookingNumber || ''}`.trim();
        const ownerContext = await buildBookingEmailContext(booking, store, {
          isOwner: true,
        });
        sendPromises.push(
          sendEmail(owner.email, ownerSubject, 'booking-confirmation-owner', ownerContext)
        );
      }
    }
  } catch (e) {
    console.error('Failed to send booking confirmation to store owner:', e);
  }

  await Promise.allSettled(sendPromises);
};

/**
 * Send booking status update email to customer (and optionally owner for key statuses)
 */
const sendBookingStatusUpdate = async (booking, store, oldStatus) => {
  if (!booking) return;

  const context = await buildBookingEmailContext(booking, store, { oldStatus });
  const prettyStatus = (booking.status || '').charAt(0).toUpperCase() + (booking.status || '').slice(1);
  const subject = `Booking #${booking.bookingNumber || ''} ${prettyStatus}`.trim();

  const sendPromises = [];

  // For different statuses, use appropriate templates
  let template = 'booking-confirmation';
  if (booking.status === 'confirmed') {
    template = 'booking-confirmed';
  } else if (booking.status === 'cancelled') {
    template = 'booking-cancelled';
  } else if (booking.status === 'completed') {
    template = 'booking-completed';
  }

  if (booking.customer?.email) {
    sendPromises.push(
      sendEmail(booking.customer.email, subject, template, context)
    );
  }

  // Optionally notify owner for important status changes
  if (booking.status === 'cancelled' || booking.status === 'completed') {
    try {
      const business = await Business.findById(store.owner).lean();
      const emailNotificationsEnabled =
        business?.settings?.notifications?.email !== false;

      if (emailNotificationsEnabled && store?.owner) {
        const owner = await User.findById(store.owner).lean();
        if (owner?.email) {
          const ownerSubject = `Booking #${booking.bookingNumber || ''} ${prettyStatus}`.trim();
          sendPromises.push(
            sendEmail(owner.email, ownerSubject, template, context)
          );
        }
      }
    } catch (e) {
      console.error('Failed to send booking status update to store owner:', e);
    }
  }

  await Promise.allSettled(sendPromises);
};

module.exports = {
  sendEmail,
  sendRawEmail,
  sendMagicLinkEmail,
  sendWelcomeEmail,
  sendEmailChangeVerification,
  sendManagerInvitationEmail,
  sendManagerPermissionUpdateEmail,
  sendOrderConfirmation,
  sendOrderStatusUpdate,
  sendOrderCancellation,
  sendRefundConfirmation,
  sendBookingConfirmation,
  sendBookingStatusUpdate,
};