const StoreInventory = require('../models/StoreInventory');
const asyncHandler = require('../utils/asyncHandler');

// @route GET /api/store-inventories?storeId=&productId=
const getInventories = asyncHandler(async (req, res) => {
  const { storeId, productId } = req.query;
  const filter = {};
  if (storeId) filter.storeId = storeId;
  if (productId) filter.productId = productId;

  const inventories = await StoreInventory.find(filter)
    .populate('storeId', 'name city address')
    .populate('productId', 'title featuredImage price');
  res.json({ data: inventories });
});

// @route GET /api/store-inventories/check?productId=&storeId= - kiểm tra tồn kho cụ thể
const checkStock = asyncHandler(async (req, res) => {
  const { productId, storeId } = req.query;
  const inventory = await StoreInventory.findOne({ productId, storeId });
  res.json({ data: { stock: inventory?.stock || 0 } });
});

// ---------- ADMIN: quản lý tồn kho theo từng cửa hàng ----------

// @route POST /api/store-inventories - tạo/cập nhật tồn kho (upsert)
const upsertInventory = asyncHandler(async (req, res) => {
  const { storeId, productId, stock, lowStockThreshold } = req.body;
  const inventory = await StoreInventory.findOneAndUpdate(
    { storeId, productId },
    { stock, lowStockThreshold, lastUpdated: new Date() },
    { new: true, upsert: true }
  );
  res.status(201).json({ data: inventory });
});

// @route PUT /api/store-inventories/:id
const updateInventory = asyncHandler(async (req, res) => {
  const inventory = await StoreInventory.findById(req.params.id);
  if (!inventory) return res.status(404).json({ message: 'Không tìm thấy bản ghi tồn kho' });
  Object.assign(inventory, req.body, { lastUpdated: new Date() });
  await inventory.save();
  res.json({ data: inventory });
});

// @route GET /api/store-inventories/low-stock?storeId= - cảnh báo sắp hết hàng
const getLowStockAlerts = asyncHandler(async (req, res) => {
  const { storeId } = req.query;
  const filter = storeId ? { storeId } : {};
  const inventories = await StoreInventory.find(filter)
    .populate('storeId', 'name')
    .populate('productId', 'title featuredImage');
  const lowStock = inventories.filter((inv) => inv.stock <= inv.lowStockThreshold);
  res.json({ data: lowStock });
});

module.exports = { getInventories, checkStock, upsertInventory, updateInventory, getLowStockAlerts };
