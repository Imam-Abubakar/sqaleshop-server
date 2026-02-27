const AnalyticsService = require("../services/analytics.service");
const Product = require("../models/product.model");
const Order = require("../models/order.model");
const Booking = require("../models/booking.model");
const User = require("../models/user.model");

exports.getBusinessAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default to last 30 days
    const end = endDate ? new Date(endDate) : new Date();

    const analytics = await AnalyticsService.getBusinessAnalytics(
      req.store._id,
      start,
      end
    );

    const dailyStats = await AnalyticsService.getDailyStats(
      req.store._id,
      start,
      end
    );

    res.status(200).json({
      overview: analytics,
      dailyStats,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.trackPageView = async (req, res) => {
  try {
    const { page } = req.body;
    await AnalyticsService.trackPageView(req.store._id, page);
    res.status(200).json({ message: "Page view tracked" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getDashboardData = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(0); // Lifetime by default
    const end = endDate ? new Date(endDate) : new Date();

    const analytics = await AnalyticsService.getDashboardData(
      req.store._id,
      start,
      end
    );

    res.status(200).json(analytics);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSalesReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const report = await AnalyticsService.getSalesReport(
      req.store._id,
      start,
      end
    );

    res.status(200).json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getProductPerformance = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const performance = await AnalyticsService.getProductPerformance(
      req.store._id,
      start,
      end
    );

    res.status(200).json(performance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getCustomerInsights = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const insights = await AnalyticsService.getCustomerInsights(
      req.store._id,
      start,
      end
    );

    res.status(200).json(insights);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.exportAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const report = await AnalyticsService.exportAnalytics(
      req.store._id,
      start,
      end
    );

    res.status(200).json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const storeId = req.store._id;

    const [totalProducts, totalOrders, storeOwner] = await Promise.all([
      Product.countDocuments({ businessId: storeId }),
      Order.countDocuments({ storeId }),
      User.findById(req.store.owner).select('plan').lean(),
    ]);

    const stats = {
      storeViews: req.store.analytics?.views || 0,
      totalProducts,
      totalOrders,
      currentPlan: storeOwner?.plan || 'free',
      // Keep these for the existing Recent Orders / Top Products widgets
      recentOrders: await AnalyticsService.getRecentOrders(storeId, 5),
      topProducts: await AnalyticsService.getTopProducts(storeId, new Date(0), new Date()),
    };

    res.status(200).json(stats);
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ 
      message: 'Failed to load dashboard statistics',
      error: error.message 
    });
  }
};

exports.getOrdersStats = async (req, res) => {
  try {
    const storeId = req.store._id;

    const [
      totalOrders,
      pendingOrders,
      deliveredOrders,
      cancelledOrders,
    ] = await Promise.all([
      Order.countDocuments({ storeId }),
      Order.countDocuments({ storeId, status: 'pending' }),
      Order.countDocuments({ storeId, status: 'delivered' }),
      Order.countDocuments({ storeId, status: 'cancelled' }),
    ]);

    const revenueResult = await Order.aggregate([
      { $match: { storeId, 'payment.status': 'completed' } },
      { $group: { _id: null, total: { $sum: '$pricing.total' } } },
    ]);

    res.status(200).json({
      totalOrders,
      totalRevenue: revenueResult[0]?.total || 0,
      pendingOrders,
      deliveredOrders,
      cancelledOrders,
    });
  } catch (error) {
    console.error('Orders stats error:', error);
    res.status(500).json({ message: 'Failed to load order statistics', error: error.message });
  }
};

exports.getProductsStats = async (req, res) => {
  try {
    const storeId = req.store._id;

    const products = await Product.find({ businessId: storeId }).lean();

    const totalProducts = products.length;
    const activeProducts = products.filter(p => p.status === 'active').length;
    const archivedProducts = products.filter(p => p.status === 'archived').length;

    let outOfStock = 0;
    let lowStock = 0;

    for (const product of products) {
      if (!product.variants || product.variants.length === 0) continue;
      const totalInventory = product.variants.reduce((sum, v) => sum + (v.inventory || 0), 0);
      const threshold = product.lowStockThreshold || 5;
      if (totalInventory === 0) {
        outOfStock++;
      } else if (product.variants.some(v => (v.inventory || 0) <= (v.lowStockThreshold || threshold))) {
        lowStock++;
      }
    }

    res.status(200).json({ totalProducts, activeProducts, archivedProducts, outOfStock, lowStock });
  } catch (error) {
    console.error('Products stats error:', error);
    res.status(500).json({ message: 'Failed to load product statistics', error: error.message });
  }
};

exports.getDashboardPerformance = async (req, res) => {
  try {
    const storeId = req.store._id;
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const dashboardData = await AnalyticsService.getDashboardData(storeId, start, end);

    res.status(200).json({
      salesTimeline: dashboardData.salesData || [],
      averageOrderValue: dashboardData.summary?.averageOrderValue || 0,
      conversionRate: dashboardData.summary?.conversionRate || 0,
      growthRate: dashboardData.summary?.growthRate || 0,
      totalRevenue: dashboardData.summary?.totalRevenue || 0,
      totalOrders: dashboardData.summary?.totalOrders || 0,
    });
  } catch (error) {
    console.error('Dashboard performance error:', error);
    res.status(500).json({ message: 'Failed to load performance data', error: error.message });
  }
};

exports.getBookingsStats = async (req, res) => {
  try {
    const storeId = req.store._id;

    const [
      totalBookings,
      pendingBookings,
      confirmedBookings,
      cancelledBookings,
      completedBookings,
    ] = await Promise.all([
      Booking.countDocuments({ storeId }),
      Booking.countDocuments({ storeId, status: 'pending' }),
      Booking.countDocuments({ storeId, status: 'confirmed' }),
      Booking.countDocuments({ storeId, status: 'cancelled' }),
      Booking.countDocuments({ storeId, status: 'completed' }),
    ]);

    const revenueResult = await Booking.aggregate([
      { $match: { storeId, 'payment.status': 'completed' } },
      { $group: { _id: null, total: { $sum: '$pricing.total' } } },
    ]);

    res.status(200).json({
      totalBookings,
      bookingRevenue: revenueResult[0]?.total || 0,
      pendingBookings,
      confirmedBookings,
      cancelledBookings,
      completedBookings,
    });
  } catch (error) {
    console.error('Bookings stats error:', error);
    res.status(500).json({ message: 'Failed to load booking statistics', error: error.message });
  }
};



