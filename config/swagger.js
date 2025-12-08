const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Sqaleshop API Documentation',
      version: '1.0.0',
      description: 'API documentation for Sqaleshop',
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production' 
          ? 'https://api.sqale.shop' 
          : 'http://localhost:5000',
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./routes/*.js', './models/*.js'], // Point to the API routes
};

module.exports = swaggerJsdoc(options); 