// =====================================================================================================
// controllers/cartController.js - GIỎ HÀNG của khách: xem, thêm, sửa số lượng, xóa dòng, xóa hết,
// và gợi ý chi nhánh đủ hàng cho cả giỏ. Mỗi khách có đúng 1 giỏ (userId là duy nhất trong collection carts).
// Giá trong giỏ chỉ để HIỂN THỊ - khi đặt hàng, backend luôn tính lại theo giá hiện tại (orderController.placeOrder).
// =====================================================================================================
const Cart = require('../models/Cart'); // giỏ hàng
const Product = require('../models/Product'); // sản phẩm + các phiên bản (variants)
const StoreInventory = require('../models/StoreInventory'); // tồn kho theo chi nhánh + phiên bản
const Store = require('../models/Store'); // chi nhánh
const asyncHandler = require('../utils/asyncHandler'); // bắt lỗi hàm async

// Lấy giỏ của khách, chưa có thì tạo rỗng.
// SỬA LỖI: trước đây "findOne rồi create" -> 2 request đồng thời lần đầu (VD trang chủ + header cùng gọi /api/cart)
// cùng thấy "chưa có giỏ" và cùng tạo -> request thứ 2 vi phạm chỉ số duy nhất userId -> lỗi 500.
// Nay dùng 1 lệnh upsert nguyên tử: MongoDB tự đảm bảo chỉ tạo đúng 1 giỏ.
const getOrCreateCart = async (userId) => {
  try {
    return await Cart.findOneAndUpdate(
      { userId }, // giỏ của khách này
      { $setOnInsert: { userId, items: [] } }, // chỉ đặt giá trị khi TẠO MỚI (giỏ đã có thì giữ nguyên)
      { upsert: true, new: true } // không có thì tạo; trả về bản ghi sau cập nhật
    );
  } catch (err) {
    if (err.code === 11000) return Cart.findOne({ userId }); // hiếm: 2 upsert cùng lúc -> lệnh thua đọc lại giỏ vừa tạo
    throw err;
  }
};

// Id các cửa hàng đang hoạt động (cửa hàng đã đóng không bán được)
async function activeStoreIds() {
  return Store.find({ isActive: { $ne: false } }).distinct('_id'); // distinct: chỉ lấy danh sách _id
}

// Số lượng TỐI ĐA mua được của 1 phiên bản: tại đúng cửa hàng nếu có storeId; ngược lại lấy cửa hàng còn
// NHIỀU hàng nhất. Một đơn hàng chỉ lấy hàng từ 1 chi nhánh, nên không được cộng dồn tồn kho mọi chi nhánh
// (trước đây: chi nhánh A còn 2 + B còn 2 thì giỏ cho mua 4, nhưng không chi nhánh nào giao đủ 4).
async function getVariantStock(productId, variantId, storeId) {
  if (storeId) { // khách đang xem theo 1 chi nhánh cụ thể
    const inv = await StoreInventory.findOne({ productId, variantId, storeId });
    return inv?.stock || 0; // không có dòng tồn kho = 0
  }
  // Không chỉ định chi nhánh -> lấy chi nhánh đang hoạt động có tồn kho lớn nhất
  const best = await StoreInventory.findOne({ productId, variantId, storeId: { $in: await activeStoreIds() } }).sort({ stock: -1 });
  return best?.stock || 0;
}

// 2 dòng giỏ là "cùng 1 món" khi cùng sản phẩm và cùng phiên bản (màu / dung lượng)
const sameLine = (item, productId, variantId) =>
  item.productId.toString() === String(productId) && item.variantId?.toString() === String(variantId);

// Dựng phản hồi giỏ hàng: đồng bộ giá theo phiên bản + gắn trạng thái từng dòng để giao diện cảnh báo
// NGAY trong giỏ (thay vì khách chỉ biết khi bấm đặt hàng và bị báo lỗi):
//   availability = 'ok' | 'unavailable' (sản phẩm/phiên bản đã ngừng bán hoặc bị xóa) | 'out_of_stock'
//   stock = số lượng mua được tối đa trong 1 đơn = tồn kho của cửa hàng còn nhiều hàng nhất ("chỉ còn N sản phẩm")
async function buildCartResponse(cart) {
  if (!cart.items.length) return { ...cart.toObject(), hasUnavailable: false }; // giỏ rỗng: trả luôn
  // Tải 1 lần mọi sản phẩm trong giỏ (chỉ lấy trường cần dùng)
  const products = await Product.find({ _id: { $in: cart.items.map((i) => i.productId) } }, 'variants isActive vatRate');
  const productMap = new Map(products.map((p) => [p._id.toString(), p])); // tra cứu nhanh theo id
  // Tồn kho lớn nhất của từng phiên bản trên các chi nhánh đang hoạt động (gom nhóm trong MongoDB)
  const stocks = await StoreInventory.aggregate([
    { $match: { variantId: { $in: cart.items.map((i) => i.variantId) }, storeId: { $in: await activeStoreIds() } } }, // lọc đúng phiên bản + chi nhánh mở
    { $group: { _id: '$variantId', stock: { $max: '$stock' } } } // mỗi phiên bản lấy tồn kho cao nhất
  ]);
  const stockMap = new Map(stocks.map((s) => [String(s._id), s.stock]));

  // Đồng bộ lại unitPrice theo giá HIỆN TẠI của đúng phiên bản - giá có thể đã được admin đổi kể từ
  // lúc thêm vào giỏ, nếu không trang Giỏ hàng/Thanh toán hiển thị sai giá cũ.
  let changed = false; // có dòng nào đổi giá không (để biết cần lưu)
  const status = []; // trạng thái từng dòng, cùng thứ tự với cart.items
  for (const item of cart.items) {
    const product = productMap.get(item.productId.toString());
    const variant = product?.variants.id(item.variantId); // tìm phiên bản trong mảng variants
    if (variant && item.unitPrice !== variant.effectivePrice) { // effectivePrice = giá đang bán (có tính giá giảm)
      item.unitPrice = variant.effectivePrice;
      changed = true;
    }
    const stock = stockMap.get(String(item.variantId)) || 0;
    // Ngừng bán > hết hàng (không đủ số lượng) > bình thường
    const availability = !product?.isActive || !variant?.isActive ? 'unavailable' : stock < item.quantity ? 'out_of_stock' : 'ok';
    status.push({ availability, stock, vatRate:product?.vatRate ?? 10 }); // vatRate mặc định 10%
  }
  if (changed) await cart.save(); // lưu giá mới

  const obj = cart.toObject(); // đổi sang object thường để gắn thêm trường
  obj.items = obj.items.map((item, i) => ({ ...item, ...status[i] })); // ghép trạng thái vào từng dòng
  obj.hasUnavailable = status.some((s) => s.availability !== 'ok'); // có dòng lỗi -> giao diện khóa nút đặt hàng
  return obj;
}

// @route GET /api/cart
const getCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.account._id);
  res.json({ data: await buildCartResponse(cart) });
});

// @route GET /api/cart/stores - chi nhánh nào giao đủ CẢ giỏ hàng (1 đơn chỉ lấy hàng từ 1 chi nhánh).
// Trước đây trang thanh toán luôn chọn sẵn chi nhánh đầu tiên; chi nhánh đó thiếu hàng thì khách chỉ biết khi
// bấm "Đặt hàng" và bị từ chối. Trả về các chi nhánh đủ hàng trước, mỗi chi nhánh kèm danh sách sản phẩm thiếu.
const getCartStores = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.account._id);
  const stores = await Store.find({ isActive: { $ne: false } }).select('name city address').sort({ name: 1 }); // chi nhánh đang mở, theo tên
  const inventories = cart.items.length // giỏ có hàng -> lấy tồn kho của mọi phiên bản trong giỏ tại mọi chi nhánh
    ? await StoreInventory.find({ variantId: { $in: cart.items.map((i) => i.variantId) }, storeId: { $in: stores.map((s) => s._id) } }).select('storeId variantId stock')
    : [];
  const stockOf = new Map(inventories.map((inv) => [`${inv.storeId}_${inv.variantId}`, inv.stock])); // khóa "chiNhanh_phienBan"
  const data = stores.map((s) => {
    const missing = cart.items // các món chi nhánh này không đủ số lượng
      .filter((item) => (stockOf.get(`${s._id}_${item.variantId}`) || 0) < item.quantity)
      .map((item) => [item.name, item.variantLabel].filter(Boolean).join(' - ')); // tên hiển thị "iPhone - Đen"
    return { _id: s._id, name: s.name, city: s.city, address: s.address, enough: missing.length === 0, missing };
  });
  data.sort((a, b) => Number(b.enough) - Number(a.enough)); // chi nhánh đủ hàng lên đầu
  res.json({ data });
});

// @route POST /api/cart/items { productId, variantId, quantity, storeId? }
const addItem = asyncHandler(async (req, res) => {
  const { productId, variantId, quantity = 1, storeId } = req.body;
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1) return res.status(400).json({ message: 'Số lượng không hợp lệ' }); // phải là số nguyên >= 1

  const product = await Product.findById(productId);
  if (!product || !product.isActive) { // không có hoặc đã ẩn
    return res.status(404).json({ message: 'Sản phẩm không tồn tại hoặc đã ngừng kinh doanh' });
  }
  const variant = variantId ? product.variants.id(variantId) : null; // bắt buộc chọn phiên bản
  if (!variant || !variant.isActive) {
    return res.status(400).json({ message: 'Vui lòng chọn phiên bản (màu/dung lượng) còn kinh doanh' });
  }

  const cart = await getOrCreateCart(req.account._id);
  const existing = cart.items.find((i) => sameLine(i, productId, variantId)); // món này đã có trong giỏ chưa
  const totalQuantityAfterAdd = (existing?.quantity || 0) + qty;

  // Kiểm tra tồn kho theo TỔNG số lượng sau khi thêm (kể cả số lượng đã có sẵn trong giỏ)
  const availableStock = await getVariantStock(productId, variantId, storeId);
  if (availableStock < totalQuantityAfterAdd) {
    return res.status(400).json({ message: 'Phiên bản này không đủ số lượng tồn kho' });
  }

  if (existing) {
    existing.quantity += qty; // đã có -> cộng dồn
  } else {
    cart.items.push({ // chưa có -> thêm dòng mới, lưu sẵn tên/ảnh/giá để hiển thị nhanh
      productId,
      variantId: variant._id,
      variantLabel: variant.label,
      name: product.title,
      image: variant.image || product.featuredImage, // ảnh của phiên bản, không có thì ảnh đại diện sản phẩm
      unitPrice: variant.effectivePrice,
      quantity: qty
    });
  }
  await cart.save();
  res.status(201).json({ data: await buildCartResponse(cart) });
});

// @route PUT /api/cart/items/:itemId { quantity }
const updateItem = asyncHandler(async (req, res) => {
  const quantity = Number(req.body.quantity);
  const cart = await getOrCreateCart(req.account._id);
  const item = cart.items.id(req.params.itemId); // tìm dòng theo _id của dòng
  if (!item) return res.status(404).json({ message: 'Không tìm thấy sản phẩm trong giỏ hàng' });
  if (!Number.isInteger(quantity)) return res.status(400).json({ message: 'Số lượng không hợp lệ' });

  if (quantity <= 0) {
    item.deleteOne(); // số lượng 0 hoặc âm = xóa dòng
  } else {
    // Giảm số lượng luôn được phép (để khách tự đưa về mức còn hàng); chỉ kiểm tra tồn kho khi TĂNG
    const availableStock = quantity > item.quantity ? await getVariantStock(item.productId, item.variantId) : Infinity;
    if (availableStock < quantity) {
      return res.status(400).json({ message: 'Phiên bản này không đủ số lượng tồn kho' });
    }
    item.quantity = quantity;
  }
  await cart.save();
  res.json({ data: await buildCartResponse(cart) });
});

// @route DELETE /api/cart/items/:itemId
const removeItem = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.account._id);
  const item = cart.items.id(req.params.itemId);
  if (!item) return res.status(404).json({ message: 'Không tìm thấy sản phẩm trong giỏ hàng' });
  item.deleteOne(); // xóa dòng khỏi mảng
  await cart.save();
  res.json({ data: await buildCartResponse(cart) });
});

// @route DELETE /api/cart - xóa hết giỏ
const clearCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.account._id);
  cart.items = [];
  await cart.save();
  res.json({ data: await buildCartResponse(cart) });
});

module.exports = {
  getCartStores,
  getCart, addItem, updateItem, removeItem, clearCart };
