const express = require('express');
const router = express.Router();
const { getStores, getCities, adminListStores, createStore, updateStore, deleteStore } = require('../controllers/storeController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.get('/', getStores);
router.get('/cities', getCities);
router.get('/admin/all', protect, authorize('admin'), adminListStores);
router.post('/', protect, authorize('admin'), createStore);
router.put('/:id', protect, authorize('admin'), updateStore);
router.delete('/:id', protect, authorize('admin'), deleteStore);

module.exports = router;
