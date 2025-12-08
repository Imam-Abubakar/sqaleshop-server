const AnalyticsService = require("../services/analytics.service");

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
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();

    const dashboardData = await AnalyticsService.getDashboardData(
      req.store._id,
      start,
      end
    );

    // Transform data for dashboard display
    const stats = {
      totalOrders: dashboardData.summary?.totalOrders || 0,
      totalRevenue: dashboardData.summary?.totalRevenue || 0,
      totalCustomers: dashboardData.summary?.totalCustomers || 0,
      totalProducts: dashboardData.summary?.totalProducts || 0,
      averageOrderValue: dashboardData.summary?.averageOrderValue || 0,
      conversionRate: dashboardData.summary?.conversionRate || 0,
      growthRate: dashboardData.summary?.growthRate || 0,
      storeViews: req.store.analytics?.views || 0,
      recentOrders: dashboardData.recentOrders || [],
      topProducts: dashboardData.topProducts || [],
      // Booking-specific dashboard stats
      totalBookings: dashboardData.summary?.totalBookings || 0,
      bookingRevenue: dashboardData.summary?.bookingRevenue || 0,
      bookingStatusBreakdown:
        dashboardData.bookingSummary?.statusBreakdown || {},
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



