const Cart = require('../models/Cart');
const Product = require('../models/Product');
const StoreInventory = require('../models/StoreInventory');
const asyncHandler = require('../utils/asyncHandler');

const getOrCreateCart = async (userId) => {
  let cart = await Cart.findOne({ userId });
  if (!cart) cart = await Cart.create({ userId, items: [] });
  return cart;
};

const getCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.account._id);
  res.json({ data: cart });
});

const addItem = asyncHandler(async (req, res) => {
  const { productId, quantity = 1, storeId } = req.body;
  const product = await Product.findById(productId);
  if (!product || !product.isActive) {
    return res.status(404).json({ message: 'Sản phẩm không tồn tại hoặc đã ngừng kinh doanh' });
  }

  const price = product.salePrice || product.price;
  const cart = await getOrCreateCart(req.account._id);
  const existing = cart.items.find((i) => i.productId.toString() === productId);
  const totalQuantityAfterAdd = (existing?.quantity || 0) + Number(quantity);

  // Kiểm tra tồn kho theo TỔNG số lượng sau khi thêm (kể cả số lượng đã có sẵn trong giỏ):
  // nếu có chọn storeId thì kiểm tra đúng cửa hàng đó, ngược lại kiểm tra tổng tồn kho toàn hệ thống
  let availableStock;
  if (storeId) {
    const inv = await StoreInventory.findOne({ productId, storeId });
    availableStock = inv?.stock || 0;
  } else {
    const inventories = await StoreInventory.find({ productId });
    availableStock = inventories.reduce((sum, inv) => sum + inv.stock, 0);
  }
  if (availableStock < totalQuantityAfterAdd) {
    return res.status(400).json({ message: 'Sản phẩm không đủ số lượng tồn kho' });
  }

  if (existing) {
    existing.quantity += Number(quantity);
  } else {
    cart.items.push({
      productId,
      name: product.title,
      image: product.featuredImage,
      unitPrice: price,
      quantity
    });
  }
  await cart.save();
  res.status(201).json({ data: cart });
});

const updateItem = asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const cart = await getOrCreateCart(req.account._id);
  const item = cart.items.id(req.params.itemId);
  if (!item) return res.status(404).json({ message: 'Không tìm thấy sản phẩm trong giỏ hàng' });

  if (quantity <= 0) {
    item.deleteOne();
  } else {
    const inventories = await StoreInventory.find({ productId: item.productId });
    const availableStock = inventories.reduce((sum, inv) => sum + inv.stock, 0);
    if (availableStock < quantity) {
      return res.status(400).json({ message: 'Sản phẩm không đủ số lượng tồn kho' });
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
