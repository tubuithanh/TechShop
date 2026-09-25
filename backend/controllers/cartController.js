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

const getCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.account._id);

  // Đồng bộ lại unitPrice theo giá HIỆN TẠI của đúng phiên bản mỗi khi tải giỏ hàng - giá có thể đã
  // được admin đổi kể từ lúc thêm vào giỏ, nếu không trang Giỏ hàng/Thanh toán hiển thị sai giá cũ.
  if (cart.items.length) {
    const products = await Product.find({ _id: { $in: cart.items.map((i) => i.productId) } }, 'variants isActive');
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));
    let changed = false;
    for (const item of cart.items) {
      const variant = productMap.get(item.productId.toString())?.variants.id(item.variantId);
      if (variant && item.unitPrice !== variant.effectivePrice) {
        item.unitPrice = variant.effectivePrice;
        changed = true;
      }
    }
    if (changed) await cart.save();
  }

  res.json({ data: cart });
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
  res.status(201).json({ data: cart });
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
    const availableStock = await getVariantStock(item.productId, item.variantId);
    if (availableStock < quantity) {
      return res.status(400).json({ message: 'Phiên bản này không đủ số lượng tồn kho' });
    }
    item.quantity = quantity;
  }
  await cart.save();
  res.json({ data: cart });
});

const removeItem = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.account._id);
  const item = cart.items.id(req.params.itemId);
  if (!item) return res.status(404).json({ message: 'Không tìm thấy sản phẩm trong giỏ hàng' });
  item.deleteOne();
  await cart.save();
  res.json({ data: cart });
});

const clearCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.account._id);
  cart.items = [];
  await cart.save();
  res.json({ data: cart });
});

module.exports = { getCart, addItem, updateItem, removeItem, clearCart };
