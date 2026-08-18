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
const { protect, authorize } = require('../middlewares/authMiddleware');

router.get('/', getPosts);
router.get('/admin/all', protect, authorize('admin', 'staff'), getPostsAdmin);
router.get('/:slug', getPostBySlug);
router.post('/:id/comments', protect, addComment);
router.post('/', protect, authorize('admin', 'staff'), createPost);
router.put('/:id', protect, authorize('admin', 'staff'), updatePost);
router.delete('/:id', protect, authorize('admin'), deletePost);

module.exports = router;
