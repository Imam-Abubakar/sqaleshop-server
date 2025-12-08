const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const errorHandler = require("./middleware/error.middleware");
const connectDB = require("./config/database");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");
const createCorsConfig = require("./config/cors");
require("dotenv").config();

// Import routes
const authRoutes = require("./routes/auth.routes");
const businessRoutes = require("./routes/business.routes");
const productRoutes = require("./routes/product.routes");
const categoryRoutes = require("./routes/category.routes");
const serviceRoutes = require("./routes/service.routes");

const analyticsRoutes = require("./routes/analytics.routes");
const storeRoutes = require("./routes/store.routes");
const subscriptionRoutes = require("./routes/subscription.routes");
const settingsRoutes = require("./routes/settings.routes");
const customerRoutes = require("./routes/customer.routes");
const orderRoutes = require("./routes/order.routes");
const bookingSlotRoutes = require("./routes/booking-slot.routes");
const bookingRoutes = require("./routes/booking.routes");
const blogRoutes = require("./routes/blog.routes");
const platformAnalyticsRoutes = require("./routes/platform-analytics.routes");
const marketingRoutes = require("./routes/marketing.routes");

// Import public routes
const publicRoutes = require('./routes/public.routes');

// Initialize express
const app = express();

// Connect to database
connectDB();

// CORS middleware - apply before all routes
// Add OPTIONS handling for preflight requests
app.use(cors(createCorsConfig()));
app.options('*', cors(createCorsConfig())); // Enable pre-flight for all routes

// Debug route for CORS testing
app.get('/api/test-cors', (req, res) => {
  res.json({ message: 'CORS test successful', headers: req.headers });
});

// Simple POST test for CORS
app.post('/api/test-cors', (req, res) => {
  res.json({ message: 'CORS POST test successful', headers: req.headers, body: req.body });
});

// Debug route for order testing
app.post('/api/test-order', (req, res) => {
  console.log('Test order endpoint hit');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  console.log('Files:', req.files);
  
  res.json({ 
    message: 'Order test successful', 
    headers: req.headers,
    body: req.body,
    files: req.files
  });
});

// Other middleware
app.use(express.json({ limit: '150mb' }));
app.use(express.urlencoded({ extended: true, limit: '150mb' }));
app.use(cookieParser());
app.use(morgan("dev"));


// Swagger documentation - place this before your routes
app.use('/api-docs', swaggerUi.serve);
app.get('/api-docs', swaggerUi.setup(swaggerSpec, { explorer: true }));

// Subdomain handling - consider commenting this out for testing
// app.use(handleSubdomain);

//Check if server is running
app.get("/", (req, res) => {
  res.status(200).json({ message: "Server is running" });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/businesses", businessRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/services", serviceRoutes);

app.use("/api/analytics", analyticsRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/stores", storeRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/booking-slots", bookingSlotRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/platform-analytics", platformAnalyticsRoutes);
app.use("/api/marketing", marketingRoutes);

// Public API routes (no authentication required)
app.use('/api/public', publicRoutes);

// Debug route - add this to see what routes are being missed
app.use('*', (req, res) => {
  console.log(`Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: 'Not found', path: req.originalUrl });
});

// Error handling
app.use(errorHandler);

// Start server

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
