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
const { getProductReviews, createReview } = require('../controllers/reviewController');
const { getQuestions, createQuestion, answerQuestion } = require('../controllers/questionController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.get('/', getProducts);
router.post('/compare', compareProducts);
router.get('/:slug', getProductBySlug);
router.get('/:id/related', getRelatedProducts);

router.get('/:productId/reviews', getProductReviews);
router.post('/:productId/reviews', protect, createReview);

router.get('/:productId/questions', getQuestions);
router.post('/:productId/questions', protect, createQuestion);
router.post('/questions/:questionId/answers', protect, answerQuestion);

router.post('/', protect, authorize('admin', 'staff'), createProduct);
router.put('/:id', protect, authorize('admin', 'staff'), updateProduct);
router.delete('/:id', protect, authorize('admin'), deleteProduct);

module.exports = router;

