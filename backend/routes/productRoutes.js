const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProductBySlug,
  getRelatedProducts,
  compareProducts,
  createProduct,
  updateProduct,
  deleteProduct
} = require('../controllers/productController');
const { getProductReviews, createReview, updateReview } = require('../controllers/reviewController');
const { getQuestions, createQuestion, answerQuestion } = require('../controllers/questionController');
const { protect, authorize, can } = require('../middlewares/authMiddleware');
const { reviewLimiter, uploadLimiter } = require('../middlewares/rateLimits');
const { importFromUrl } = require('../controllers/productImportController');

router.get('/', getProducts);
router.post('/compare', compareProducts);
router.get('/:slug', getProductBySlug);
router.get('/:id/related', getRelatedProducts);

router.get('/:productId/reviews', getProductReviews);
router.post('/:productId/reviews', protect, reviewLimiter, createReview);
router.put('/:productId/reviews/:reviewId', protect, reviewLimiter, updateReview);

router.get('/:productId/questions', getQuestions);
router.post('/:productId/questions', protect, createQuestion);
router.post('/questions/:questionId/answers', protect, answerQuestion);

// Nhập thông tin sản phẩm từ link thegioididong.com (trả bản nháp, không tự tạo sản phẩm). Dùng chung
// giới hạn tần suất với tải ảnh vì mỗi lần nhập tải về nhiều ảnh.
router.post('/import-url', protect, can('products.manage'), uploadLimiter, importFromUrl);
router.post('/', protect, can('products.manage'), createProduct);
router.put('/:id', protect, can('products.manage'), updateProduct);
router.delete('/:id', protect, authorize('admin'), deleteProduct);

module.exports = router;

