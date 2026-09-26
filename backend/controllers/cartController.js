const Cart = require('../models/Cart');
const Product = require('../models/Product');
const StoreInventory = require('../models/StoreInventory');
const asyncHandler = require('../utils/asyncHandler');

const getOrCreateCart = async (userId) => {
  let cart = await Cart.findOne({ userId });
  if (!cart) cart = await Cart.create({ userId, items: [] });
  return cart;
};

// Tồn kho của 1 phiên bản: tại đúng cửa hàng nếu có storeId, ngược lại cộng dồn mọi cửa hàng
async function getVariantStock(productId, variantId, storeId) {
  if (storeId) {
    const inv = await StoreInventory.findOne({ productId, variantId, storeId });
    return inv?.stock || 0;
  }
  const inventories = await StoreInventory.find({ productId, variantId });
  return inventories.reduce((sum, inv) => sum + inv.stock, 0);
}

const sameLine = (item, productId, variantId) =>
  item.productId.toString() === String(productId) && item.variantId?.toString() === String(variantId);

// Dựng phản hồi giỏ hàng: đồng bộ giá theo phiên bản + gắn trạng thái từng dòng để giao diện cảnh báo
// NGAY trong giỏ (thay vì khách chỉ biết khi bấm đặt hàng và bị báo lỗi):
//   availability = 'ok' | 'unavailable' (sản phẩm/phiên bản đã ngừng bán hoặc bị xóa) | 'out_of_stock'
//   stock = tổng tồn kho của phiên bản ở các cửa hàng (để hiện "chỉ còn N sản phẩm")
async function buildCartResponse(cart) {
  if (!cart.items.length) return { ...cart.toObject(), hasUnavailable: false };
  const products = await Product.find({ _id: { $in: cart.items.map((i) => i.productId) } }, 'variants isActive');
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));
  const stocks = await StoreInventory.aggregate([
    { $match: { variantId: { $in: cart.items.map((i) => i.variantId) } } },
    { $group: { _id: '$variantId', stock: { $sum: '$stock' } } }
  ]);
  const stockMap = new Map(stocks.map((s) => [String(s._id), s.stock]));

  // Đồng bộ lại unitPrice theo giá HIỆN TẠI của đúng phiên bản - giá có thể đã được admin đổi kể từ
  // lúc thêm vào giỏ, nếu không trang Giỏ hàng/Thanh toán hiển thị sai giá cũ.
  let changed = false;
  const status = [];
  for (const item of cart.items) {
    const product = productMap.get(item.productId.toString());
    const variant = product?.variants.id(item.variantId);
    if (variant && item.unitPrice !== variant.effectivePrice) {
      item.unitPrice = variant.effectivePrice;
      changed = true;
    }
    const stock = stockMap.get(String(item.variantId)) || 0;
    const availability = !product?.isActive || !variant?.isActive ? 'unavailable' : stock < item.quantity ? 'out_of_stock' : 'ok';
    status.push({ availability, stock });
  }
  if (changed) await cart.save();

  const obj = cart.toObject();
  obj.items = obj.items.map((item, i) => ({ ...item, ...status[i] }));
  obj.hasUnavailable = status.some((s) => s.availability !== 'ok');
  return obj;
}

const getCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.account._id);
  res.json({ data: await buildCartResponse(cart) });
});

const addItem = asyncHandler(async (req, res) => {
  const { productId, variantId, quantity = 1, storeId } = req.body;
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1) return res.status(400).json({ message: 'Số lượng không hợp lệ' });

  const product = await Product.findById(productId);
  if (!product || !product.isActive) {
    return res.status(404).json({ message: 'Sản phẩm không tồn tại hoặc đã ngừng kinh doanh' });
  }
  const variant = variantId ? product.variants.id(variantId) : null;
  if (!variant || !variant.isActive) {
    return res.status(400).json({ message: 'Vui lòng chọn phiên bản (màu/dung lượng) còn kinh doanh' });
  }

  const cart = await getOrCreateCart(req.account._id);
  const existing = cart.items.find((i) => sameLine(i, productId, variantId));
  const totalQuantityAfterAdd = (existing?.quantity || 0) + qty;

  // Kiểm tra tồn kho theo TỔNG số lượng sau khi thêm (kể cả số lượng đã có sẵn trong giỏ)
  const availableStock = await getVariantStock(productId, variantId, storeId);
  if (availableStock < totalQuantityAfterAdd) {
    return res.status(400).json({ message: 'Phiên bản này không đủ số lượng tồn kho' });
  }

  if (existing) {
    existing.quantity += qty;
  } else {
    cart.items.push({
      productId,
      variantId: variant._id,
      variantLabel: variant.label,
      name: product.title,
      image: variant.image || product.featuredImage,
      unitPrice: variant.effectivePrice,
      quantity: qty
    });
  }
  await cart.save();
  res.status(201).json({ data: await buildCartResponse(cart) });
});

const updateItem = asyncHandler(async (req, res) => {
  const quantity = Number(req.body.quantity);
  const cart = await getOrCreateCart(req.account._id);
  const item = cart.items.id(req.params.itemId);
  if (!item) return res.status(404).json({ message: 'Không tìm thấy sản phẩm trong giỏ hàng' });
  if (!Number.isInteger(quantity)) return res.status(400).json({ message: 'Số lượng không hợp lệ' });

  if (quantity <= 0) {
    item.deleteOne();
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

const removeItem = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.account._id);
  const item = cart.items.id(req.params.itemId);
  if (!item) return res.status(404).json({ message: 'Không tìm thấy sản phẩm trong giỏ hàng' });
  item.deleteOne();
  await cart.save();
  res.json({ data: await buildCartResponse(cart) });
});

const clearCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.account._id);
  cart.items = [];
  await cart.save();
  res.json({ data: await buildCartResponse(cart) });
});

module.exports = { getCart, addItem, updateItem, removeItem, clearCart };
