const Product = require('../models/product.model');
const cloudinaryService = require('../services/cloudinary.service');
const { v2: cloudinary } = require('cloudinary');

const mapIncomingImage = async (imageData, fallbackAlt) => {
  if (typeof imageData === 'string' && imageData.startsWith('data:')) {
    const result = await cloudinaryService.uploadBase64(imageData, 'products');
    return {
      url: result.url,
      publicId: result.publicId,
      alt: fallbackAlt,
      isDefault: false,
    };
  }

  if (imageData && typeof imageData === 'object' && imageData.url) {
    return {
      url: imageData.url,
      publicId: imageData.publicId || null,
      alt: imageData.alt || fallbackAlt,
      isDefault: imageData.isDefault ?? false,
    };
  }

  return null;
};

const ensureDefaultImage = (images, fallbackAlt) => {
  if (!images || images.length === 0) {
    return [];
  }

  const hasDefault = images.some((image) => image.isDefault);
  if (!hasDefault) {
    images[0].isDefault = true;
  }

  return images.map((image, index) => ({
    ...image,
    alt: image.alt || fallbackAlt,
    isDefault: index === 0 ? true : Boolean(image.isDefault),
  }));
};

exports.createProduct = async (req, res) => {
  try {
    const { 
      name, 
      description, 
      basePrice, 
      compareAtPrice, 
      category, 
      options, 
      variants,
      seo,
      status,
      tags,
      metadata,
      sku,
      weight,
      dimensions,
      lowStockThreshold
    } = req.body;
    
    const images = [];

    if (req.body.images && Array.isArray(req.body.images)) {
      for (const imageData of req.body.images) {
        const mappedImage = await mapIncomingImage(imageData, name);
        if (mappedImage) {
          images.push(mappedImage);
        }
      }
    }
    
    // Handle traditional file uploads
    if (req.files) {
      for (const file of req.files) {
        // Convert buffer to base64 for Cloudinary upload
        const base64Data = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
        const result = await cloudinaryService.uploadBase64(base64Data, 'products');
        images.push({
          url: result.url,
          publicId: result.publicId,
          alt: name,
          isDefault: images.length === 0
        });
      }
    }

    const normalizedImages = ensureDefaultImage(images, name);

    const product = await Product.create({
      businessId: req.store._id,
      name,
      description,
      basePrice: parseFloat(basePrice),
      compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : null,
      category,
      images: normalizedImages,
      options: options || [],
      variants: variants || [],
      seo: seo || {},
      status: status || 'draft',
      tags: tags || [],
      metadata: metadata || new Map(),
      sku,
      weight: weight ? parseFloat(weight) : null,
      dimensions: dimensions || {},
      lowStockThreshold: lowStockThreshold ? parseInt(lowStockThreshold) : 5
    });

    res.status(201).json(product);
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const { search, category, status, sortBy = 'createdAt', sortOrder = 'desc', page = 1, limit = 20 } = req.query;
    
    // Build query
    const query = { businessId: req.store._id };
    
    if (search) {
      query.$text = { $search: search };
    }
    
    if (category && category !== 'all') {
      query.category = category;
    }
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('category', 'name _id')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Product.countDocuments(query)
    ]);
    
    // Add virtual fields manually since we're using lean()
    const productsWithVirtuals = products.map(product => {
      const totalStock = product.variants ? product.variants.reduce((sum, variant) => sum + (variant.inventory || 0), 0) : 0;
      const lowStock = product.variants ? product.variants.some(v => (v.inventory || 0) <= (v.lowStockThreshold || 5)) : false;
      
      let stockStatus = 'out_of_stock';
      if (totalStock > 0) {
        stockStatus = lowStock ? 'low_stock' : 'in_stock';
      }
      
      return {
        ...product,
        stockStatus,
        totalStock
      };
    });
    
    res.status(200).json({
      products: productsWithVirtuals,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getProduct = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      businessId: req.store._id,
    }).populate('category', 'name _id');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.status(200).json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { 
      name, 
      description, 
      basePrice, 
      compareAtPrice, 
      category, 
      options, 
      variants,
      seo,
      status,
      tags,
      metadata,
      sku,
      weight,
      dimensions,
      lowStockThreshold
    } = req.body;
    
    const product = await Product.findOne({
      _id: req.params.productId,
      businessId: req.store._id,
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Update basic fields
    if (name) product.name = name;
    if (description) product.description = description;
    if (basePrice !== undefined) product.basePrice = parseFloat(basePrice);
    if (compareAtPrice !== undefined) product.compareAtPrice = compareAtPrice ? parseFloat(compareAtPrice) : null;
    if (category) product.category = category;
    if (status) product.status = status;
    if (options) product.options = options;
    if (variants) product.variants = variants;
    if (seo) product.seo = { ...product.seo, ...seo };
    if (tags) product.tags = tags;
    if (metadata) product.metadata = metadata;
    if (sku !== undefined) product.sku = sku;
    if (weight !== undefined) product.weight = weight ? parseFloat(weight) : null;
    if (dimensions) product.dimensions = { ...product.dimensions, ...dimensions };
    if (lowStockThreshold !== undefined) product.lowStockThreshold = parseInt(lowStockThreshold);

    // Handle image uploads (existing + new)
    if (req.body.images && Array.isArray(req.body.images)) {
      const incomingImages = [];
      for (const imageData of req.body.images) {
        const mappedImage = await mapIncomingImage(imageData, product.name);
        if (mappedImage) {
          incomingImages.push(mappedImage);
        }
      }

      const normalizedImages = ensureDefaultImage(incomingImages, product.name);
      const incomingPublicIds = new Set(
        normalizedImages
          .filter((image) => image.publicId)
          .map((image) => image.publicId)
      );

      for (const image of product.images) {
        if (image.publicId && !incomingPublicIds.has(image.publicId)) {
          await cloudinaryService.delete(image.publicId);
        }
      }

      product.images = normalizedImages;
    }
    
    // Handle traditional file uploads (fallback flow)
    if (req.files && req.files.length > 0) {
      const uploadedImages = [];
      for (const file of req.files) {
        const base64Data = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
        const result = await cloudinaryService.uploadBase64(base64Data, 'products');
        uploadedImages.push({
          url: result.url,
          publicId: result.publicId,
          alt: product.name,
          isDefault: false
        });
      }

      product.images = ensureDefaultImage(
        [...product.images, ...uploadedImages],
        product.name
      );
    }

    await product.save();
    res.status(200).json(product);
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.productId,
      businessId: req.store._id,
    }).populate('category', 'name _id');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.status(200).json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateInventory = async (req, res) => {
  try {
    const { inventory, variantId } = req.body;
    const product = await Product.findOne({
      _id: req.params.productId,
      businessId: req.store._id,
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (variantId) {
      const variant = product.variants.id(variantId);
      if (!variant) {
        return res.status(404).json({ message: 'Variant not found' });
      }
      variant.inventory = parseInt(inventory);
    } else {
      // If no variant specified and variants exist, update all variants with same quantity
      if (Array.isArray(product.variants) && product.variants.length > 0) {
        product.variants.forEach(v => { v.inventory = parseInt(inventory); });
      }
    }

    await product.save();

    res.status(200).json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Category management has been moved to category.controller.js



exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.productId,
      businessId: req.store._id,
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Delete images from Cloudinary
    if (Array.isArray(product.images) && product.images.length > 0) {
      const deleteOps = product.images
        .filter((image) => image?.publicId)
        .map((image) => cloudinaryService.delete(image.publicId));

      await Promise.all(deleteOps);
    }

    await product.deleteOne();
    res.status(200).json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.duplicateProduct = async (req, res) => {
  try {
    const originalProduct = await Product.findOne({
      _id: req.params.productId,
      businessId: req.store._id,
    });

    if (!originalProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Create a new product object with duplicated data
    const duplicatedProductData = {
      businessId: originalProduct.businessId,
      name: `${originalProduct.name} (Copy)`,
      description: originalProduct.description,
      basePrice: originalProduct.basePrice,
      compareAtPrice: originalProduct.compareAtPrice,
      category: originalProduct.category,
      options: originalProduct.options,
      variants: originalProduct.variants,
      seo: originalProduct.seo,
      status: 'draft', // Always set duplicated products as draft
      tags: originalProduct.tags,
      metadata: originalProduct.metadata,
      sku: originalProduct.sku ? `${originalProduct.sku}-COPY` : undefined,
      weight: originalProduct.weight,
      dimensions: originalProduct.dimensions,
      lowStockThreshold: originalProduct.lowStockThreshold,
      isDigital: originalProduct.isDigital,
      downloadable: originalProduct.downloadable,
      shippingRequired: originalProduct.shippingRequired,
      taxable: originalProduct.taxable,
      vendor: originalProduct.vendor,
      featured: false, // Reset featured status for duplicated product
    };

    // Duplicate images (create new Cloudinary uploads)
    const duplicatedImages = [];
    for (const image of originalProduct.images) {
      try {
        // For now, we'll keep the original image URLs but create new public IDs
        // This is a simpler approach that avoids downloading and re-uploading
        duplicatedImages.push({
          url: image.url,
          publicId: null, // We'll set this to null since we're not creating new uploads
          alt: `${originalProduct.name} (Copy)`,
          isDefault: duplicatedImages.length === 0
        });
      } catch (imageError) {
        console.error('Failed to duplicate image:', imageError);
        // If image duplication fails, keep the original URL but without publicId
        duplicatedImages.push({
          url: image.url,
          publicId: null,
          alt: `${originalProduct.name} (Copy)`,
          isDefault: duplicatedImages.length === 0
        });
      }
    }

    duplicatedProductData.images = duplicatedImages;

    // Create the new product
    const duplicatedProduct = await Product.create(duplicatedProductData);

    res.status(201).json(duplicatedProduct);
  } catch (error) {
    console.error('Duplicate product error:', error);
    res.status(500).json({ message: error.message });
  }
}; 

exports.getImageUploadSignature = async (req, res) => {
  try {
    const timestamp = Math.round(Date.now() / 1000);
    const folder = `products/${req.store?._id || 'default'}`;

    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder },
      cloudinary.config().api_secret
    );

    res.status(200).json({
      timestamp,
      signature,
      folder,
      cloudName: cloudinary.config().cloud_name,
      apiKey: cloudinary.config().api_key,
    });
  } catch (error) {
    console.error('Cloudinary signature error:', error);
    res.status(500).json({ message: 'Failed to get upload credentials' });
  }
};