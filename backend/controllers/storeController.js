const Store = require('../models/Store');
const asyncHandler = require('../utils/asyncHandler');

const getStores = asyncHandler(async (req, res) => {
  const { city } = req.query;
  const filter = { isActive: true };
  if (city) filter.city = city;
  const stores = await Store.find(filter).sort({ city: 1, name: 1 });
  res.json({ data: stores });
});

const getCities = asyncHandler(async (req, res) => {
  const cities = await Store.distinct('city', { isActive: true });
  res.json({ data: cities.sort() });
});

const createStore = asyncHandler(async (req, res) => {
  const store = await Store.create(req.body);
  res.status(201).json({ data: store });
});

const updateStore = asyncHandler(async (req, res) => {
  const store = await Store.findById(req.params.id);
  if (!store) return res.status(404).json({ message: 'Không tìm thấy cửa hàng' });
  Object.assign(store, req.body);
  await store.save();
  res.json({ data: store });
});

const deleteStore = asyncHandler(async (req, res) => {
  const store = await Store.findById(req.params.id);
  if (!store) return res.status(404).json({ message: 'Không tìm thấy cửa hàng' });
  store.isActive = false;
  await store.save();
  res.json({ message: 'Đã ẩn cửa hàng' });
});

module.exports = { getStores, getCities, createStore, updateStore, deleteStore };
