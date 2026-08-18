const express = require('express');
const router = express.Router();
const {
  getCollections,
  getCollectionById,
  createCollection,
  updateCollection,
  deleteCollection
} = require('../controllers/collectionController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.get('/', getCollections);
router.get('/:id', getCollectionById);
router.post('/', protect, authorize('admin', 'staff'), createCollection);
router.put('/:id', protect, authorize('admin', 'staff'), updateCollection);
router.delete('/:id', protect, authorize('admin'), deleteCollection);

module.exports = router;
