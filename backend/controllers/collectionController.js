const ProductCollection = require('../models/ProductCollection');
const asyncHandler = require('../utils/asyncHandler');

const getCollections = asyncHandler(async (req, res) => {
  const collections = await ProductCollection.find().populate('productIds', 'title slug featuredImage price salePrice');
  res.json({ data: collections });
});

const getCollectionById = asyncHandler(async (req, res) => {
  const collection = await ProductCollection.findById(req.params.id).populate(
    'productIds',
    'title slug featuredImage price salePrice ratingAverage'
  );
  if (!collection) return res.status(404).json({ message: 'Không tìm thấy bộ sưu tập' });
  res.json({ data: collection });
});

const createCollection = asyncHandler(async (req, res) => {
  const collection = await ProductCollection.create(req.body);
  res.status(201).json({ data: collection });
});

const updateCollection = asyncHandler(async (req, res) => {
  const collection = await ProductCollection.findById(req.params.id);
  if (!collection) return res.status(404).json({ message: 'Không tìm thấy bộ sưu tập' });
  Object.assign(collection, req.body);
  await collection.save();
  res.json({ data: collection });
});

const deleteCollection = asyncHandler(async (req, res) => {
  const collection = await ProductCollection.findById(req.params.id);
  if (!collection) return res.status(404).json({ message: 'Không tìm thấy bộ sưu tập' });
  await collection.deleteOne();
  res.json({ message: 'Đã xóa bộ sưu tập' });
});

module.exports = { getCollections, getCollectionById, createCollection, updateCollection, deleteCollection };
