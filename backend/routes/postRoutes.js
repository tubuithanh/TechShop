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
const { uploadLimiter } = require('../middlewares/rateLimits');
const { importPostFromUrl, importPostFromHtml } = require('../controllers/postImportController');

router.get('/', getPosts);
router.get('/admin/all', protect, can('articles.manage'), getPostsAdmin);
router.get('/:slug', getPostBySlug);
router.post('/:id/comments', protect, addComment);
// Nhập bài viết từ link tinhte.vn (trả bản nháp, không tự tạo bài). Ảnh giữ link gốc của tinhte.
router.post('/import-url', protect, can('articles.manage'), uploadLimiter, importPostFromUrl);
// Dự phòng khi máy chủ bị trang nguồn chặn: admin dán mã nguồn trang copy từ trình duyệt của mình
router.post('/import-html', protect, can('articles.manage'), uploadLimiter, importPostFromHtml);
router.post('/', protect, can('articles.manage'), createPost);
router.put('/:id', protect, can('articles.manage'), updatePost);
router.delete('/:id', protect, authorize('admin'), deletePost);

module.exports = router;
