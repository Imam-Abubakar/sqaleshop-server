const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  content: {
    type: String,
    required: true,
  },
  excerpt: {
    type: String,
    maxlength: 300,
  },
  featuredImage: {
    type: String, // URL to image
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft',
  },
  tags: [{
    type: String,
    trim: true,
  }],
  category: {
    type: String,
    trim: true,
  },
  publishedAt: {
    type: Date,
  },
  views: {
    type: Number,
    default: 0,
  },
  seoTitle: {
    type: String,
  },
  seoDescription: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt field before saving
blogSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Generate slug from title
blogSchema.pre('save', function(next) {
  if (this.isModified('title') && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  next();
});

// Index for better performance
blogSchema.index({ slug: 1 });
blogSchema.index({ status: 1, publishedAt: -1 });
blogSchema.index({ author: 1 });

/**
 * @swagger
 * components:
 *   schemas:
 *     Blog:
 *       type: object
 *       required:
 *         - title
 *         - content
 *         - author
 *       properties:
 *         title:
 *           type: string
 *           description: Blog post title
 *         slug:
 *           type: string
 *           description: URL-friendly version of title
 *         content:
 *           type: string
 *           description: Blog post content (HTML)
 *         excerpt:
 *           type: string
 *           description: Short description of the post
 *         featuredImage:
 *           type: string
 *           description: URL to featured image
 *         author:
 *           type: string
 *           description: ID of the author
 *         status:
 *           type: string
 *           enum: [draft, published, archived]
 *           default: draft
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *         category:
 *           type: string
 *         publishedAt:
 *           type: string
 *           format: date-time
 *         views:
 *           type: number
 *           default: 0
 *         seoTitle:
 *           type: string
 *         seoDescription:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

module.exports = mongoose.model('Blog', blogSchema);
