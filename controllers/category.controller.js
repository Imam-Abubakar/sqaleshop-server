const mongoose = require('mongoose');
const Category = require('../models/category.model');
const Product = require('../models/product.model');
const cloudinary = require('../services/cloudinary.service');

exports.createCategory = async (req, res) => {
  try {
    const { name, description, parentCategory, isActive, sortOrder, seo, metadata } = req.body;
    
    let image = null;
    
    // Handle image upload
    if (req.body.image && typeof req.body.image === 'string' && req.body.image.startsWith('data:')) {
      const result = await cloudinary.uploadBase64(req.body.image, 'categories');
      image = {
        url: result.url,
        publicId: result.publicId,
        alt: name,
      };
    } else if (req.file) {
      // Convert buffer to base64 for Cloudinary upload
      const base64Data = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      const result = await cloudinary.uploadBase64(base64Data, 'categories');
      image = {
        url: result.url,
        publicId: result.publicId,
        alt: name,
      };
    }

    const category = await Category.create({
      businessId: req.store._id,
      name,
      description,
      image,
      parentCategory: parentCategory || null,
      isActive: isActive !== undefined ? isActive : true,
      sortOrder: sortOrder || 0,
      seo: seo || {},
      metadata: metadata || new Map(),
    });

    // If this is a subcategory, add it to parent's subcategories array
    if (parentCategory) {
      await Category.findByIdAndUpdate(parentCategory, {
        $push: { subcategories: category._id }
      });
    }

    res.status(201).json(category);
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const { includeInactive = false, tree = false, parentId } = req.query;
    
    const query = { businessId: req.store._id };
    
    if (!includeInactive) {
      query.isActive = true;
    }
    
    if (parentId) {
      query.parentCategory = parentId;
    } else if (!tree) {
      // If not building tree and no parentId specified, get root categories only
      query.parentCategory = null;
    }
    
    if (tree) {
      // Return hierarchical tree structure
      const categoryTree = await Category.getCategoryTree(req.store._id);
      return res.status(200).json(categoryTree);
    }
    
    // Get categories with product counts
    const categories = await Category.find(query)
      .populate('subcategories')
      .sort({ sortOrder: 1, name: 1 });
    
    // Get product counts for all categories
    const productCounts = await Product.aggregate([
      {
        $match: {
          businessId: mongoose.Types.ObjectId.isValid(req.store._id) ? new mongoose.Types.ObjectId(req.store._id) : req.store._id,
          category: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Create a map of category ID to product count
    const productCountMap = new Map();
    productCounts.forEach(item => {
      productCountMap.set(item._id.toString(), item.count);
    });
    
    // Add product counts to categories
    const categoriesWithCounts = categories.map(category => {
      const categoryObj = category.toObject();
      categoryObj.productCount = productCountMap.get(category._id.toString()) || 0;
      return categoryObj;
    });
    
    res.status(200).json(categoriesWithCounts);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getCategory = async (req, res) => {
  try {
    const category = await Category.findOne({
      _id: req.params.categoryId,
      businessId: req.store._id,
    })
      .populate('subcategories')
      .populate('parentCategory', 'name slug');

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Get product count for this category
    const productCount = await Product.countDocuments({ 
      businessId: req.store._id,
      category: category._id 
    });

    res.status(200).json({
      ...category.toObject(),
      productCount
    });
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { name, description, parentCategory, isActive, sortOrder, seo, metadata } = req.body;
    
    const category = await Category.findOne({
      _id: req.params.categoryId,
      businessId: req.store._id,
    });

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Update basic fields
    if (name) category.name = name;
    if (description !== undefined) category.description = description;
    if (isActive !== undefined) category.isActive = isActive;
    if (sortOrder !== undefined) category.sortOrder = sortOrder;
    if (seo) category.seo = { ...category.seo, ...seo };
    if (metadata) category.metadata = metadata;

    // Handle parent category change
    if (parentCategory !== undefined) {
      const oldParent = category.parentCategory;
      category.parentCategory = parentCategory || null;
      
      // Update old parent's subcategories array
      if (oldParent) {
        await Category.findByIdAndUpdate(oldParent, {
          $pull: { subcategories: category._id }
        });
      }
      
      // Update new parent's subcategories array
      if (parentCategory) {
        await Category.findByIdAndUpdate(parentCategory, {
          $addToSet: { subcategories: category._id }
        });
      }
    }

    // Handle image upload
    if (req.body.image && typeof req.body.image === 'string' && req.body.image.startsWith('data:')) {
      // Delete old image if exists
      if (category.image && category.image.publicId) {
        await cloudinary.delete(category.image.publicId);
      }
      
      const result = await cloudinary.uploadBase64(req.body.image, 'categories');
      category.image = {
        url: result.url,
        publicId: result.publicId,
        alt: category.name,
      };
    } else if (req.file) {
      // Delete old image if exists
      if (category.image && category.image.publicId) {
        await cloudinary.delete(category.image.publicId);
      }
      
      // Convert buffer to base64 for Cloudinary upload
      const base64Data = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      const result = await cloudinary.uploadBase64(base64Data, 'categories');
      category.image = {
        url: result.url,
        publicId: result.publicId,
        alt: category.name,
      };
    }

    await category.save();
    res.status(200).json(category);
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findOne({
      _id: req.params.categoryId,
      businessId: req.store._id,
    });

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Check if category has products
    const productCount = await Product.countDocuments({ 
      businessId: req.store._id,
      category: category._id 
    });
    
    if (productCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete category "${category.name}" because it contains ${productCount} product(s). Please move these products to another category or delete them first.`,
        productCount,
        categoryName: category.name
      });
    }

    // Check if category has subcategories
    if (category.subcategories && category.subcategories.length > 0) {
      return res.status(400).json({ 
        message: `Cannot delete category "${category.name}" because it has ${category.subcategories.length} subcategory(ies). Please delete subcategories first.`,
        subcategoryCount: category.subcategories.length,
        categoryName: category.name
      });
    }

    // Delete image from Cloudinary
    if (category.image && category.image.publicId) {
      await cloudinary.delete(category.image.publicId);
    }

    // Remove from parent's subcategories array if applicable
    if (category.parentCategory) {
      await Category.findByIdAndUpdate(category.parentCategory, {
        $pull: { subcategories: category._id }
      });
    }

    await Category.findByIdAndDelete(category._id);
    res.status(200).json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.moveProductsAndDeleteCategory = async (req, res) => {
  try {
    const { targetCategoryId } = req.body;
    
    const category = await Category.findOne({
      _id: req.params.categoryId,
      businessId: req.store._id,
    });

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Validate target category
    if (targetCategoryId) {
      const targetCategory = await Category.findOne({
        _id: targetCategoryId,
        businessId: req.store._id,
      });
      
      if (!targetCategory) {
        return res.status(400).json({ message: 'Target category not found' });
      }
    }

    // Move all products to target category (or remove category if no target)
    const updateResult = await Product.updateMany(
      { 
        businessId: req.store._id,
        category: category._id 
      },
      { 
        category: targetCategoryId || null 
      }
    );

    // Check if category has subcategories
    if (category.subcategories && category.subcategories.length > 0) {
      return res.status(400).json({ 
        message: `Cannot delete category "${category.name}" because it has ${category.subcategories.length} subcategory(ies). Please delete subcategories first.`,
        subcategoryCount: category.subcategories.length,
        categoryName: category.name
      });
    }

    // Delete image from Cloudinary
    if (category.image && category.image.publicId) {
      await cloudinary.delete(category.image.publicId);
    }

    // Remove from parent's subcategories array if applicable
    if (category.parentCategory) {
      await Category.findByIdAndUpdate(category.parentCategory, {
        $pull: { subcategories: category._id }
      });
    }

    await Category.findByIdAndDelete(category._id);
    
    res.status(200).json({ 
      message: `Category "${category.name}" deleted successfully. ${updateResult.modifiedCount} product(s) moved to ${targetCategoryId ? 'target category' : 'no category'}.`,
      movedProducts: updateResult.modifiedCount
    });
  } catch (error) {
    console.error('Move products and delete category error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.reorderCategories = async (req, res) => {
  try {
    const { categories } = req.body; // Array of { id, sortOrder }
    
    if (!Array.isArray(categories)) {
      return res.status(400).json({ message: 'Categories must be an array' });
    }

    // Update sort orders
    const updatePromises = categories.map(({ id, sortOrder }) =>
      Category.findOneAndUpdate(
        { _id: id, businessId: req.store._id },
        { sortOrder },
        { new: true }
      )
    );

    await Promise.all(updatePromises);
    
    res.status(200).json({ message: 'Categories reordered successfully' });
  } catch (error) {
    console.error('Reorder categories error:', error);
    res.status(500).json({ message: error.message });
  }
};
