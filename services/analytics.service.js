const Store = require('../models/store.model');
const Product = require('../models/product.model');
const Service = require('../models/service.model');
const Order = require('../models/order.model');
const Customer = require('../models/customer.model');
const Booking = require('../models/booking.model');

class AnalyticsService {
  async trackPageView(storeId, page) {
    try {
      const store = await Store.findById(storeId);
      if (!store) return;

      // Track page view in store analytics
      if (!store.analytics) store.analytics = { views: 0 };
      store.analytics.views += 1;
      await store.save();

      // Could expand this to track more detailed analytics
      // like unique visitors, time spent, etc.
    } catch (error) {
      console.error('Analytics error:', error);
    }
  }

  async trackOrder(storeId, amount) {
    try {
      const store = await Store.findById(storeId);
      if (!store) return;

      // Track order in store analytics
      if (!store.analytics) store.analytics = { orders: 0, revenue: 0 };
      store.analytics.orders += 1;
      store.analytics.revenue += amount;
      await store.save();
    } catch (error) {
      console.error('Analytics error:', error);
    }
  }

  async getBusinessAnalytics(storeId, startDate, endDate) {
    try {
      const products = await Product.find({ businessId: storeId });
      const services = await Service.find({ businessId: storeId });

      return {
        totalProducts: products.length,
        activeProducts: products.filter(p => p.status === 'active').length,
        totalServices: services.length,
        activeServices: services.filter(s => s.status === 'active').length,
      };
    } catch (error) {
      console.error('Analytics error:', error);
      throw error;
    }
  }

  async getDailyStats(storeId, startDate, endDate) {
    try {
      // Since bookings are removed, return empty stats
      return [];
    } catch (error) {
      console.error('Analytics error:', error);
      throw error;
    }
  }

  async getDashboardData(storeId, startDate, endDate) {
    try {
      // Get orders in date range with completed payment
      const orders = await Order.find({
        storeId,
        createdAt: { $gte: startDate, $lte: endDate },
        'payment.status': 'completed'
      });

      // Get store to find the owner (User ID) for customer queries
      const store = await Store.findById(storeId);
      if (!store) {
        throw new Error('Store not found');
      }

      // Get all customers - use store.owner (User ID) as businessId
      const customers = await Customer.find({ businessId: store.owner });
      
      // Get all products - use storeId (Store ID) as businessId
      const products = await Product.find({ businessId: storeId });

      // Calculate summary stats - only from completed payment orders
      const totalRevenue = orders.reduce((sum, order) => sum + (order.pricing?.total || 0), 0);
      const totalOrders = orders.length;
      const totalCustomers = customers.length;
      const totalProducts = products.length;
      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      // Calculate growth rate (compare with previous period)
      const previousStartDate = new Date(startDate);
      const previousEndDate = new Date(endDate);
      const periodLength = endDate.getTime() - startDate.getTime();
      previousStartDate.setTime(previousStartDate.getTime() - periodLength);
      previousEndDate.setTime(previousEndDate.getTime() - periodLength);

      const previousOrders = await Order.find({
        storeId: store._id,
        createdAt: { $gte: previousStartDate, $lte: previousEndDate },
        'payment.status': 'completed'
      });
      const previousRevenue = previousOrders.reduce((sum, order) => sum + (order.pricing?.total || 0), 0);
      const growthRate = previousRevenue > 0 ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 : 0;

      // Generate sales data timeline
      const salesData = this.generateSalesTimeline(orders, startDate, endDate);

      // Get top products
      const topProducts = await this.getTopProducts(store._id, startDate, endDate);

      // Get recent orders
      const recentOrders = await this.getRecentOrders(store._id, 5);

      // Calculate conversion rate (simplified - could be enhanced with actual analytics)
      const conversionRate = totalCustomers > 0 ? (totalOrders / totalCustomers) * 100 : 0;

      // Get booking analytics for this store
      const bookingSummary = await this.getBookingAnalytics(storeId, startDate, endDate);

      return {
        summary: {
          totalRevenue,
          totalOrders,
          totalCustomers,
          totalProducts,
          averageOrderValue,
          conversionRate: Math.min(conversionRate, 100), // Cap at 100%
          growthRate: Math.max(-100, Math.min(100, growthRate)), // Cap between -100% and 100%
          // Booking-specific summary stats
          totalBookings: bookingSummary.totalBookings,
          bookingRevenue: bookingSummary.totalRevenue,
        },
        salesData,
        topProducts,
        recentOrders,
        bookingSummary,
      };
    } catch (error) {
      console.error('Analytics error:', error);
      // Return empty data structure instead of throwing
      return {
        summary: {
          totalRevenue: 0,
          totalOrders: 0,
          totalCustomers: 0,
          totalProducts: 0,
          averageOrderValue: 0,
          conversionRate: 0,
          growthRate: 0,
          totalBookings: 0,
          bookingRevenue: 0,
        },
        salesData: [],
        topProducts: [],
        recentOrders: [],
        bookingSummary: {
          totalBookings: 0,
          totalRevenue: 0,
          statusBreakdown: {},
          dailyTimeline: [],
        },
      };
    }
  }

  async getBookingAnalytics(storeId, startDate, endDate) {
    try {
      const bookings = await Booking.find({
        storeId,
        createdAt: { $gte: startDate, $lte: endDate },
      });

      const totalBookings = bookings.length;

      // Only count revenue from bookings with completed payment
      const totalRevenue = bookings
        .filter((booking) => booking.payment?.status === 'completed')
        .reduce((sum, booking) => sum + (booking.pricing?.total || 0), 0);

      // Status breakdown
      const statusBreakdown = bookings.reduce((acc, booking) => {
        const status = booking.status || 'unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});

      // Simple daily timeline: bookings and revenue per day (up to 1 year)
      const dailyTimeline = [];
      const currentDate = new Date(startDate);
      const end = new Date(endDate);
      const maxDays = 365;
      let dayCount = 0;

      while (currentDate <= end && dayCount < maxDays) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayBookings = bookings.filter(
          (booking) => booking.createdAt.toISOString().split('T')[0] === dateStr
        );

        const dayRevenue = dayBookings
          .filter((booking) => booking.payment?.status === 'completed')
          .reduce((sum, booking) => sum + (booking.pricing?.total || 0), 0);

        dailyTimeline.push({
          date: dateStr,
          bookings: dayBookings.length,
          revenue: dayRevenue,
        });

        currentDate.setDate(currentDate.getDate() + 1);
        dayCount++;
      }

      return {
        totalBookings,
        totalRevenue,
        statusBreakdown,
        dailyTimeline,
      };
    } catch (error) {
      console.error('Booking analytics error:', error);
      return {
        totalBookings: 0,
        totalRevenue: 0,
        statusBreakdown: {},
        dailyTimeline: [],
      };
    }
  }

  async getTopProducts(storeId, startDate, endDate) {
    try {
      const orders = await Order.find({
        storeId,
        createdAt: { $gte: startDate, $lte: endDate },
        'payment.status': 'completed'
      });

      // Aggregate product sales
      const productSales = {};
      orders.forEach(order => {
        order.items.forEach(item => {
          const productId = item.product?.toString();
          if (!productSales[productId]) {
            productSales[productId] = {
              id: productId,
              name: item.productSnapshot?.name || 'Unknown Product',
              sales: 0,
              revenue: 0,
            };
          }
          productSales[productId].sales += item.quantity || 1;
          productSales[productId].revenue += (item.unitPrice || 0) * (item.quantity || 1);
        });
      });

      // Convert to array and sort by revenue
      return Object.values(productSales)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 4);
    } catch (error) {
      console.error('Top products error:', error);
      return [];
    }
  }

  async getRecentOrders(storeId, limit = 5) {
    try {
      const orders = await Order.find({ storeId })
        .sort({ createdAt: -1 })
        .limit(limit);

      return orders.map(order => ({
        id: order._id,
        orderNumber: order.orderNumber,
        customer: order.customer?.name || 'Unknown Customer',
        amount: order.pricing?.total || 0,
        status: order.status,
        date: order.createdAt,
      }));
    } catch (error) {
      console.error('Recent orders error:', error);
      return [];
    }
  }

  generateSalesTimeline(orders, startDate, endDate) {
    const timeline = [];
    const currentDate = new Date(startDate);
    
    // Ensure we don't have an infinite loop
    const maxDays = 365; // Maximum 1 year of data
    let dayCount = 0;
    
    while (currentDate <= endDate && dayCount < maxDays) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayOrders = orders.filter(order => 
        order.createdAt.toISOString().split('T')[0] === dateStr
      );
      
      const dayRevenue = dayOrders.reduce((sum, order) => sum + (order.pricing?.total || 0), 0);
      
      timeline.push({
        date: dateStr,
        revenue: dayRevenue,
        orders: dayOrders.length,
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
      dayCount++;
    }
    
    return timeline;
  }

  async getSalesReport(storeId, startDate, endDate) {
    // Implementation for sales report
    return this.getDashboardData(storeId, startDate, endDate);
  }

  async getProductPerformance(storeId, startDate, endDate) {
    // Implementation for product performance
    return this.getTopProducts(storeId, startDate, endDate);
  }

  async getCustomerInsights(storeId, startDate, endDate) {
    // Implementation for customer insights
    const store = await Store.findById(storeId);
    if (!store) {
      throw new Error('Store not found');
    }
    
    return {
      totalCustomers: await Customer.countDocuments({ businessId: store.owner }),
      newCustomers: await Customer.countDocuments({
        businessId: store.owner,
        createdAt: { $gte: startDate, $lte: endDate }
      }),
    };
  }

  async exportAnalytics(storeId, startDate, endDate) {
    // Implementation for analytics export
    const data = await this.getDashboardData(storeId, startDate, endDate);
    return data;
  }
}

module.exports = new AnalyticsService(); 