const StoreInventory = require('../models/StoreInventory');
const asyncHandler = require('../utils/asyncHandler');
const { getScopedStoreId } = require('../middlewares/authMiddleware');

// @route GET /api/store-inventories?storeId=&productId=
const getInventories = asyncHandler(async (req, res) => {
  const { productId, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (productId) filter.productId = productId;

  // "Quản lý chi nhánh" (staff được gán storeId cụ thể) chỉ được xem đúng tồn kho chi nhánh mình -
  // BỎ QUA storeId họ tự truyền lên (nếu có), luôn ép về đúng chi nhánh được gán, để không ai lách
  // qua tham số query để xem/chỉnh tồn kho chi nhánh khác.
  const scopedStoreId = getScopedStoreId(req);
  if (scopedStoreId) {
    filter.storeId = scopedStoreId;
  } else if (req.query.storeId) {
    filter.storeId = req.query.storeId;
  }

  const inventories = await StoreInventory.find(filter)
    .populate('storeId', 'name city address')
    .populate('productId', 'title featuredImage price')
    .sort({ lastUpdated: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));
  const total = await StoreInventory.countDocuments(filter);
  res.json({ data: inventories, total, page: Number(page), totalPages: Math.ceil(total / limit) });
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
  if (typeof stock !== 'number' || stock < 0) {
    return res.status(400).json({ message: 'Số lượng tồn kho không hợp lệ (phải là số >= 0)' });
  }

  // Quản lý chi nhánh chỉ được thiết lập tồn kho cho ĐÚNG chi nhánh được gán - chặn ngay cả khi họ
  // có quyền inventory.manage, vì quyền đó không đồng nghĩa "mọi chi nhánh" với tài khoản bị giới hạn.
  const scopedStoreId = getScopedStoreId(req);
  if (scopedStoreId && String(storeId) !== scopedStoreId) {
    return res.status(403).json({ message: 'Bạn chỉ được quản lý tồn kho của chi nhánh mình phụ trách' });
  }

  const inventory = await StoreInventory.findOneAndUpdate(
    { storeId, productId },
    { stock, lowStockThreshold, lastUpdated: new Date() },
    { new: true, upsert: true, runValidators: true }
  );
  res.status(201).json({ data: inventory });
});

// @route PUT /api/store-inventories/:id
const updateInventory = asyncHandler(async (req, res) => {
  const inventory = await StoreInventory.findById(req.params.id);
  if (!inventory) return res.status(404).json({ message: 'Không tìm thấy bản ghi tồn kho' });

  const scopedStoreId = getScopedStoreId(req);
  if (scopedStoreId && inventory.storeId.toString() !== scopedStoreId) {
    return res.status(403).json({ message: 'Bạn chỉ được quản lý tồn kho của chi nhánh mình phụ trách' });
  }

  Object.assign(inventory, req.body, { lastUpdated: new Date() });
  await inventory.save();
  res.json({ data: inventory });
});

// @route GET /api/store-inventories/low-stock?storeId= - cảnh báo sắp hết hàng
const getLowStockAlerts = asyncHandler(async (req, res) => {
  const scopedStoreId = getScopedStoreId(req);
  const filter = scopedStoreId ? { storeId: scopedStoreId } : req.query.storeId ? { storeId: req.query.storeId } : {};
  const inventories = await StoreInventory.find(filter)
    .populate('storeId', 'name')
    .populate('productId', 'title featuredImage');
  const lowStock = inventories.filter((inv) => inv.stock <= inv.lowStockThreshold);
  res.json({ data: lowStock });
});

module.exports = { getInventories, checkStock, upsertInventory, updateInventory, getLowStockAlerts };
