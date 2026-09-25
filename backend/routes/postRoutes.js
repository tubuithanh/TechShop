const express = require('express');
const router = express.Router();
const {
  getPosts,
  getPostBySlug,
  addComment,
  getPostsAdmin,
  createPost,
  updatePost,
  deletePost
} = require('../controllers/postController');
const { protect, authorize, can } = require('../middlewares/authMiddleware');

router.get('/', getPosts);
router.get('/admin/all', protect, can('articles.manage'), getPostsAdmin);
router.get('/:slug', getPostBySlug);
router.post('/:id/comments', protect, addComment);
router.post('/', protect, can('articles.manage'), createPost);
router.put('/:id', protect, can('articles.manage'), updatePost);
router.delete('/:id', protect, authorize('admin'), deletePost);

module.exports = router;
