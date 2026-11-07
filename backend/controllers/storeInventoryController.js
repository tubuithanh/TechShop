const StoreInventory = require('../models/StoreInventory');
const Product = require('../models/Product');
const Store = require('../models/Store');
const asyncHandler = require('../utils/asyncHandler');
const { searchFilter } = require('../utils/search');
const { getScopedStoreId } = require('../middlewares/authMiddleware');

// Số lượng hàng (tồn kho, ngưỡng cảnh báo): số nguyên >= 0 - không có "2,5 chiếc"
const isCount = (value) => Number.isInteger(value) && value >= 0;
const THRESHOLD_ERROR = 'Ngưỡng cảnh báo sắp hết hàng phải là số nguyên >= 0';

// Chi nhánh được gán cho 1 staff không tự động biến mất khi cửa hàng đó bị ẩn (isActive=false) -
// không có cơ chế dọn dẹp nào khác gán lại/gỡ storeId khi admin ẩn 1 cửa hàng. Nếu không kiểm tra
// lại đây, staff đó vẫn thao tác được vô thời hạn lên tồn kho của 1 chi nhánh đã ngừng hoạt động.
async function assertScopedStoreIsActive(scopedStoreId) {
  if (!scopedStoreId) return true;
  const store = await Store.findById(scopedStoreId);
  return Boolean(store?.isActive);
}

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

  // Tìm theo tên sản phẩm / màu / dung lượng: tìm sản phẩm khớp trước (qua index), rồi lấy tồn kho của chúng
  const productSearch = searchFilter(req.query.q);
  if (productSearch) {
    const ids = await Product.find(productSearch).distinct('_id');
    filter.productId = filter.productId ? { $in: ids.filter((id) => String(id) === String(filter.productId)) } : { $in: ids };
  }
  if (req.query.lowStock === 'true') filter.$expr = { $lte: ['$stock', '$lowStockThreshold'] };

  const inventories = await StoreInventory.find(filter)
    .populate('storeId', 'name city address')
    .populate('productId', 'title featuredImage price variants')
    .sort({ lastUpdated: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));
  const total = await StoreInventory.countDocuments(filter);
  res.json({ data: inventories.map(withVariantLabel), total, page: Number(page), totalPages: Math.ceil(total / limit) });
});

// Gắn nhãn phiên bản ("Đen - 256GB") vào bản ghi tồn kho để hiển thị, rồi bỏ danh sách variants đầy đủ
// của sản phẩm khỏi kết quả (chỉ cần để tra nhãn, không cần gửi về cho từng dòng).
function withVariantLabel(inv) {
  const obj = inv.toObject();
  const variant = inv.productId?.variants?.id(inv.variantId);
  obj.variantLabel = variant ? variant.label : '(phiên bản đã xóa)';
  if (obj.productId) delete obj.productId.variants;
  return obj;
}

// @route GET /api/store-inventories/check?productId=&variantId=&storeId= - kiểm tra tồn kho cụ thể
const checkStock = asyncHandler(async (req, res) => {
  const { productId, variantId, storeId } = req.query;
  const inventory = await StoreInventory.findOne({ productId, variantId, storeId });
  res.json({ data: { stock: inventory?.stock || 0 } });
});

// ---------- ADMIN: quản lý tồn kho theo từng cửa hàng ----------

// @route POST /api/store-inventories - tạo/cập nhật tồn kho (upsert)
const upsertInventory = asyncHandler(async (req, res) => {
  const { storeId, productId, variantId, stock, lowStockThreshold } = req.body;
  if (!isCount(stock)) {
    return res.status(400).json({ message: 'Số lượng tồn kho không hợp lệ (phải là số nguyên >= 0)' });
  }
  if (lowStockThreshold !== undefined && !isCount(lowStockThreshold)) return res.status(400).json({ message: THRESHOLD_ERROR });
  if (!storeId || !(await Store.exists({ _id: storeId }))) {
    return res.status(400).json({ message: 'Vui lòng chọn đúng cửa hàng' });
  }
  // Tồn kho tính theo phiên bản - phiên bản phải thực sự thuộc sản phẩm này (không nhận variantId tùy ý)
  const product = productId ? await Product.findById(productId, 'variants') : null;
  if (!product || !variantId || !product.variants.id(variantId)) {
    return res.status(400).json({ message: 'Vui lòng chọn đúng sản phẩm và phiên bản (màu/dung lượng)' });
  }

  // Quản lý chi nhánh chỉ được thiết lập tồn kho cho ĐÚNG chi nhánh được gán - chặn ngay cả khi họ
  // có quyền inventory.manage, vì quyền đó không đồng nghĩa "mọi chi nhánh" với tài khoản bị giới hạn.
  const scopedStoreId = getScopedStoreId(req);
  if (scopedStoreId && String(storeId) !== scopedStoreId) {
    return res.status(403).json({ message: 'Bạn chỉ được quản lý tồn kho của chi nhánh mình phụ trách' });
  }
  if (scopedStoreId && !(await assertScopedStoreIsActive(scopedStoreId))) {
    return res.status(403).json({ message: 'Chi nhánh bạn phụ trách đã ngừng hoạt động, vui lòng liên hệ quản trị viên' });
  }

  const inventory = await StoreInventory.findOneAndUpdate(
    { storeId, productId, variantId },
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
  if (scopedStoreId && !(await assertScopedStoreIsActive(scopedStoreId))) {
    return res.status(403).json({ message: 'Chi nhánh bạn phụ trách đã ngừng hoạt động, vui lòng liên hệ quản trị viên' });
  }

  // CHỈ cho sửa stock/lowStockThreshold - trước đây Object.assign(inventory, req.body) chấp nhận
  // BẤT KỲ field nào gửi lên, kể cả storeId/productId. Một "Quản lý chi nhánh" gửi kèm storeId của
  // MỘT chi nhánh khác trong body sẽ vượt qua được kiểm tra ở trên (vẫn đang sửa đúng bản ghi thuộc
  // chi nhánh mình) rồi Object.assign ghi đè storeId của bản ghi sang chi nhánh khác - lách hoàn
  // toàn cơ chế giới hạn theo chi nhánh.
  // Ghi bằng 1 lệnh cập nhật có điều kiện thay vì đọc-rồi-lưu cả bản ghi: trước đây nếu có đơn hàng trừ kho
  // đúng lúc nhân viên đang sửa, số nhân viên nhập ghi đè mất lần trừ đó (tồn kho "ảo"). 3 cách sửa số lượng:
  //  - adjust: nhập thêm (+) / xuất bớt (-) theo số chênh lệch, cộng trừ nguyên tử, không để tồn kho âm;
  //  - stock + expectedStock: đặt số tuyệt đối (kiểm kê) chỉ khi tồn kho vẫn đúng như lúc xem, khác thì 409;
  //  - stock không kèm expectedStock: đặt thẳng (giữ cho tương thích).
  const { stock, expectedStock, adjust, lowStockThreshold } = req.body;
  const condition = { _id: inventory._id };
  const update = { $set: { lastUpdated: new Date() } };
  if (adjust !== undefined) {
    if (!Number.isInteger(adjust) || adjust === 0) return res.status(400).json({ message: 'Số lượng nhập / xuất phải là số nguyên khác 0' });
    if (stock !== undefined) return res.status(400).json({ message: 'Chỉ dùng 1 cách: nhập / xuất theo chênh lệch hoặc đặt số lượng' });
    update.$inc = { stock: adjust };
    if (adjust < 0) condition.stock = { $gte: -adjust };
  } else if (stock !== undefined) {
    if (!isCount(stock)) {
      return res.status(400).json({ message: 'Số lượng tồn kho không hợp lệ (phải là số nguyên >= 0)' });
    }
    if (expectedStock !== undefined) {
      if (!isCount(expectedStock)) return res.status(400).json({ message: 'Số lượng tồn cũ không hợp lệ' });
      condition.stock = expectedStock;
    }
    update.$set.stock = stock;
  }
  if (lowStockThreshold !== undefined) {
    if (!isCount(lowStockThreshold)) return res.status(400).json({ message: THRESHOLD_ERROR });
    update.$set.lowStockThreshold = lowStockThreshold;
  }
  const saved = await StoreInventory.findOneAndUpdate(condition, update, { new: true });
  if (!saved) {
    const current = await StoreInventory.findById(inventory._id);
    if (adjust < 0) return res.status(400).json({ message: `Không đủ hàng để xuất (còn ${current?.stock ?? 0})`, data: current });
    return res.status(409).json({ message: `Tồn kho vừa thay đổi (hiện còn ${current?.stock ?? 0}), vui lòng kiểm tra rồi nhập lại`, data: current });
  }
  res.json({ data: saved });
});

// @route GET /api/store-inventories/low-stock?storeId= - cảnh báo sắp hết hàng
const getLowStockAlerts = asyncHandler(async (req, res) => {
  const scopedStoreId = getScopedStoreId(req);
  const filter = scopedStoreId ? { storeId: scopedStoreId } : req.query.storeId ? { storeId: req.query.storeId } : {};
  const inventories = await StoreInventory.find(filter)
    .populate('storeId', 'name')
    .populate('productId', 'title featuredImage variants');
  const lowStock = inventories.filter((inv) => inv.stock <= inv.lowStockThreshold).map(withVariantLabel);
  res.json({ data: lowStock });
});

module.exports = { getInventories, checkStock, upsertInventory, updateInventory, getLowStockAlerts };
