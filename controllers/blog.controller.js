const Blog = require('../models/blog.model');
const { AppError } = require('../utils/errors');

// Get all blog posts (for admin panel)
const getAllBlogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const blogs = await Blog.find(query)
      .populate('author', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Blog.countDocuments(query);

    res.json({
      blogs,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get published blog posts (for website)
const getPublishedBlogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 9, category, tag } = req.query;
    const skip = (page - 1) * limit;

    let query = { status: 'published' };
    
    if (category) {
      query.category = category;
    }
    
    if (tag) {
      query.tags = { $in: [tag] };
    }

    const blogs = await Blog.find(query)
      .populate('author', 'name')
      .select('title slug excerpt featuredImage author publishedAt views tags category')
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Blog.countDocuments(query);

    res.json({
      blogs,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get single blog post by slug
const getBlogBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;
    
    const blog = await Blog.findOne({ slug, status: 'published' })
      .populate('author', 'name');

    if (!blog) {
      throw new AppError('Blog post not found', 404);
    }

    // Increment view count
    blog.views += 1;
    await blog.save();

    res.json(blog);
  } catch (error) {
    next(error);
  }
};

// Get single blog post by ID (for admin)
const getBlogById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const blog = await Blog.findById(id)
      .populate('author', 'name email');

    if (!blog) {
      throw new AppError('Blog post not found', 404);
    }

    res.json(blog);
  } catch (error) {
    next(error);
  }
};

// Create new blog post
const createBlog = async (req, res, next) => {
  try {
    const blogData = {
      ...req.body,
      author: req.user._id
    };

    const blog = new Blog(blogData);
    await blog.save();

    await blog.populate('author', 'name email');

    res.status(201).json(blog);
  } catch (error) {
    if (error.code === 11000) {
      next(new AppError('A blog post with this slug already exists', 400));
    } else {
      next(error);
    }
  }
};

// Update blog post
const updateBlog = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const blog = await Blog.findById(id);
    if (!blog) {
      throw new AppError('Blog post not found', 404);
    }

    // Set publishedAt if status is being changed to published
    if (req.body.status === 'published' && blog.status !== 'published') {
      req.body.publishedAt = new Date();
    }

    Object.assign(blog, req.body);
    await blog.save();

    await blog.populate('author', 'name email');

    res.json(blog);
  } catch (error) {
    if (error.code === 11000) {
      next(new AppError('A blog post with this slug already exists', 400));
    } else {
      next(error);
    }
  }
};

// Delete blog post
const deleteBlog = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const blog = await Blog.findById(id);
    if (!blog) {
      throw new AppError('Blog post not found', 404);
    }

    await Blog.findByIdAndDelete(id);

    res.json({ message: 'Blog post deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Get blog categories
const getBlogCategories = async (req, res, next) => {
  try {
    const categories = await Blog.distinct('category', { status: 'published' });
    res.json(categories.filter(cat => cat)); // Remove null/empty values
  } catch (error) {
    next(error);
  }
};

// Get blog tags
const getBlogTags = async (req, res, next) => {
  try {
    const tags = await Blog.distinct('tags', { status: 'published' });
    res.json(tags.filter(tag => tag)); // Remove null/empty values
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllBlogs,
  getPublishedBlogs,
  getBlogBySlug,
  getBlogById,
  createBlog,
  updateBlog,
  deleteBlog,
  getBlogCategories,
  getBlogTags
};
