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

  // Đồng bộ lại unitPrice theo giá HIỆN TẠI của sản phẩm mỗi khi tải giỏ hàng - trước đây giá chỉ
  // được lưu 1 lần lúc thêm vào giỏ và không bao giờ làm mới, nên nếu admin đổi giá sau đó, Frontend
  // (trang Giỏ hàng/Thanh toán) vẫn hiển thị SAI giá cũ dù lúc đặt hàng backend đã tính đúng giá mới
  // - gây lệch giữa số tiền xem trước và số tiền thực sự bị tính.
  if (cart.items.length) {
    const products = await Product.find(
      { _id: { $in: cart.items.map((i) => i.productId) } },
      'effectivePrice isActive'
    );
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));
    let changed = false;
    for (const item of cart.items) {
      const product = productMap.get(item.productId.toString());
      if (product && product.isActive && item.unitPrice !== product.effectivePrice) {
        item.unitPrice = product.effectivePrice;
        changed = true;
      }
    }
    if (changed) await cart.save();
  }

  res.json({ data: cart });
});

const addItem = asyncHandler(async (req, res) => {
  const { productId, quantity = 1, storeId } = req.body;
  const product = await Product.findById(productId);
  if (!product || !product.isActive) {
    return res.status(404).json({ message: 'Sản phẩm không tồn tại hoặc đã ngừng kinh doanh' });
  }

  // Dùng effectivePrice (đã được model tự tính đúng, xử lý cả trường hợp salePrice=0 cho hàng
  // khuyến mãi miễn phí) thay vì `salePrice || price` - toán tử `||` coi 0 là falsy nên sẽ SAI,
  // rơi về giá gốc thay vì giá 0đ mà admin chủ ý đặt.
  const price = product.effectivePrice;
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
