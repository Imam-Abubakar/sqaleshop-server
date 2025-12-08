const mongoose = require('mongoose');
const slugify = require('slugify');

const categorySchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  slug: {
    type: String,
    unique: true,
  },
  description: {
    type: String,
    trim: true,
  },
  image: {
    url: String,
    publicId: String,
    alt: String,
  },
  parentCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null,
  },
  subcategories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
  }],
  isActive: {
    type: Boolean,
    default: true,
  },
  sortOrder: {
    type: Number,
    default: 0,
  },
  metadata: {
    type: Map,
    of: String,
  },
  seo: {
    title: String,
    description: String,
    keywords: [String],
  },
}, {
  timestamps: true,
});

// Indexes
categorySchema.index({ businessId: 1, isActive: 1 });
categorySchema.index({ businessId: 1, parentCategory: 1 });

// Pre-save hook for slug generation
categorySchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  next();
});

// Virtual for product count
categorySchema.virtual('productCount', {
  ref: 'Product',
  localField: '_id',
  foreignField: 'category',
  count: true,
});

// Method to get all subcategories recursively
categorySchema.methods.getAllSubcategories = async function() {
  const Category = this.constructor;
  const subcategories = [];
  
  const getSubcats = async (categoryId) => {
    const cats = await Category.find({ parentCategory: categoryId });
    for (const cat of cats) {
      subcategories.push(cat);
      await getSubcats(cat._id);
    }
  };
  
  await getSubcats(this._id);
  return subcategories;
};

// Static method to get category tree
categorySchema.statics.getCategoryTree = async function(businessId) {
  const Product = mongoose.model('Product');
  
  // Get all categories
  const categories = await this.find({ 
    businessId, 
    isActive: true 
  }).sort({ sortOrder: 1, name: 1 });
  
  // Get product counts for all categories
  const productCounts = await Product.aggregate([
    {
      $match: {
        businessId: mongoose.Types.ObjectId.isValid(businessId) ? new mongoose.Types.ObjectId(businessId) : businessId,
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
  
  const categoryMap = new Map();
  const rootCategories = [];
  
  // Create a map of all categories, preserving the subcategories field and adding product count
  categories.forEach(cat => {
    const categoryObj = cat.toObject();
    const productCount = productCountMap.get(cat._id.toString()) || 0;
    categoryMap.set(cat._id.toString(), { 
      ...categoryObj, 
      productCount,
      children: [],
      subcategories: categoryObj.subcategories || [] // Ensure subcategories field is preserved
    });
  });
  
  // Build the tree structure
  categories.forEach(cat => {
    const category = categoryMap.get(cat._id.toString());
    if (cat.parentCategory) {
      const parent = categoryMap.get(cat.parentCategory.toString());
      if (parent) {
        parent.children.push(category);
      }
    } else {
      rootCategories.push(category);
    }
  });
  
  return rootCategories;
};

module.exports = mongoose.model('Category', categorySchema);
