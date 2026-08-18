const express = require('express');
const router = express.Router();
const { getBrands, createBrand, updateBrand, deleteBrand } = require('../controllers/brandController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.get('/', getBrands);
router.post('/', protect, authorize('admin'), createBrand);
router.put('/:id', protect, authorize('admin'), updateBrand);
router.delete('/:id', protect, authorize('admin'), deleteBrand);

module.exports = router;
