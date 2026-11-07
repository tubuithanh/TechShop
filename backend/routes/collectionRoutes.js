const express = require('express');
const router = express.Router();
const {
  getCollections,
  getCollectionById,
  createCollection,
  updateCollection,
  deleteCollection
} = require('../controllers/collectionController');
const { protect, authorize, can } = require('../middlewares/authMiddleware');

router.get('/', getCollections);
router.get('/:id', getCollectionById);
router.post('/', protect, can('collections.manage'), createCollection);
router.put('/:id', protect, can('collections.manage'), updateCollection);
router.delete('/:id', protect, authorize('admin'), deleteCollection);

module.exports = router;
