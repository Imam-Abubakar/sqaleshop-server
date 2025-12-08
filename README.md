# Sqaleshop Server

Backend API server for Sqaleshop e-commerce platform.

## Getting Started

1. Install dependencies:
   ```
   npm install
   ```

2. Set up environment variables (copy `.env.example` to `.env` and fill in values)

3. Start the server:
   ```
   npm run dev
   ```

## Image Upload Guidelines

We've eliminated the need for disk-based file uploads to improve performance and reduce server resource usage:

### Server-Side

1. **Never use disk storage for uploaded files**
   - All image uploads should be handled using base64 data directly

2. **Using Cloudinary for Image Storage**
   - Use the `cloudinaryService.uploadBase64()` method which accepts base64 image data
   - Example:
     ```js
     const cloudinaryResult = await cloudinary.uploadBase64(imageBase64Data, 'folder-name');
     const imageUrl = cloudinaryResult.url;
     ```

3. **API Endpoints**
   - When creating endpoints that handle image uploads, accept base64 string data directly
   - Don't use multer or other disk-based middleware

### Client-Side

1. **Image Processing Components**
   - Use `LogoUpload` for single image uploads
   - Use `ImageUpload` for multiple image uploads
   - Both components handle compression and conversion to base64

2. **Handling Base64 Data**
   - These components provide base64 data via their `onProcessed` or `onBase64Change` props
   - Send this data directly to the API without creating FormData with actual files

3. **Image Processing Utility**
   - The `imageProcessor.ts` utility provides methods for compressing and converting images

## Architecture Overview

The application follows a layered architecture:

- **Routes**: Define API endpoints
- **Controllers**: Handle request logic
- **Services**: Contain business logic
- **Models**: Define data structures

## API Documentation

API endpoints are documented using Swagger. After starting the server, visit `/api-docs` to view the documentation. 