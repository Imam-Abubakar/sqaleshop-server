const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

class CloudinaryService {
  /**
   * Upload an image from file path to Cloudinary
   * @param {string} filePath - The local file path of the image to upload
   * @param {string} folder - The folder to upload to in Cloudinary
   * @returns {Promise<{url: string, publicId: string}>} The uploaded image URL and public ID
   */
  async upload(filePath, folder = 'sqaleshop') {
    try {
      const result = await cloudinary.uploader.upload(filePath, {
        folder,
        resource_type: 'image',
        transformation: [
          { quality: 'auto:best' }, // Use 'best' instead of 'good' for better quality
          { fetch_format: 'auto' },
          { width: 1200, height: 1200, crop: 'limit' }
        ]
      });
      return {
        url: result.secure_url,
        publicId: result.public_id,
      };
    } catch (error) {
      console.error('Cloudinary file upload error:', error);
      throw new Error('File upload failed');
    }
  }

  /**
   * Upload an image from base64 data to Cloudinary
   * @param {string} base64Data - The base64 data of the image to upload
   * @param {string} folder - The folder to upload to in Cloudinary
   * @returns {Promise<{url: string, publicId: string}>} The uploaded image URL and public ID
   */
  async uploadBase64(base64Data, folder = 'sqaleshop') {
    try {
      // Upload directly from base64 data with optimizations
      const result = await cloudinary.uploader.upload(base64Data, {
        folder,
        resource_type: 'image',
        transformation: [
          { quality: 'auto:best' }, // Use 'best' instead of 'good' for better quality
          { fetch_format: 'auto' },
          { width: 1200, height: 1200, crop: 'limit' }
        ]
      });
      return {
        url: result.secure_url,
        publicId: result.public_id,
      };
    } catch (error) {
      console.error('Cloudinary base64 upload error:', error);
      throw new Error('Base64 file upload failed');
    }
  }

  /**
   * Delete an image from Cloudinary
   * @param {string} publicId - The public ID of the image to delete
   * @returns {Promise<void>}
   */
  async delete(publicId) {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      console.error('Cloudinary delete error:', error);
      throw new Error('File deletion failed');
    }
  }
}

module.exports = new CloudinaryService(); 