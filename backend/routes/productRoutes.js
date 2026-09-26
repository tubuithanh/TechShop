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

router.get('/', getProducts);
router.post('/compare', compareProducts);
router.get('/:slug', getProductBySlug);
router.get('/:id/related', getRelatedProducts);

router.get('/:productId/reviews', getProductReviews);
router.post('/:productId/reviews', protect, createReview);
router.put('/:productId/reviews/:reviewId', protect, updateReview);

router.get('/:productId/questions', getQuestions);
router.post('/:productId/questions', protect, createQuestion);
router.post('/questions/:questionId/answers', protect, answerQuestion);

router.post('/', protect, can('products.manage'), createProduct);
router.put('/:id', protect, can('products.manage'), updateProduct);
router.delete('/:id', protect, authorize('admin'), deleteProduct);

module.exports = router;

