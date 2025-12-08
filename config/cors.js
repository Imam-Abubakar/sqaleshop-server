const createCorsConfig = () => ({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      "http://localhost:5173",
      "http://localhost:3000",
      "http://localhost:4173",
      "https://app.sqale.shop",
      "https://app.sqaleshop.com",
      "https://*.sqaleshop.com",
      "https://*.sqale.shop",
      "https://sqaleshop.com",
      "https://www.sqaleshop.com",
      "https://www.sqale.shop",
      "https://www.sqaleshop.com",
      "https://sqale.shop",
    ];
    
    // Check if the origin is allowed
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin.includes('*')) {
        // Handle wildcard domains
        const domain = allowedOrigin.replace('https://*.', 'https://');
        return origin.startsWith(domain);
      }
      return origin === allowedOrigin;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      // For debugging, allow all origins
      callback(null, true);
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
    "Store-ID",
    "store-id",
    "store-url",
    "Content-Length",
  ],
  exposedHeaders: ["Content-Length", "X-Requested-With"],
  credentials: true,
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204,
});

module.exports = createCorsConfig;