const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth.middleware');
const {
  getAllBlogs,
  getPublishedBlogs,
  getBlogBySlug,
  getBlogById,
  createBlog,
  updateBlog,
  deleteBlog,
  getBlogCategories,
  getBlogTags
} = require('../controllers/blog.controller');

// Public routes (for website)
router.get('/published', getPublishedBlogs);
router.get('/categories', getBlogCategories);
router.get('/tags', getBlogTags);
router.get('/:slug', getBlogBySlug);

// Admin routes (superadmin only)
router.use(protect);
router.use(restrictTo('superadmin'));

router.get('/', getAllBlogs);
router.get('/admin/:id', getBlogById);
router.post('/', createBlog);
router.put('/:id', updateBlog);
router.delete('/:id', deleteBlog);

module.exports = router;
