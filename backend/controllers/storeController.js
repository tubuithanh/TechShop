const Store = require('../models/Store');
const asyncHandler = require('../utils/asyncHandler');

const getStores = asyncHandler(async (req, res) => {
  const { city } = req.query;
  const filter = { isActive: true }; // khách chỉ thấy chi nhánh đang mở
  if (city) filter.city = city; // lọc theo tỉnh / thành
  const stores = await Store.find(filter).sort({ city: 1, name: 1 }); // theo tỉnh rồi tên
  res.json({ data: stores });
});

const getCities = asyncHandler(async (req, res) => {
  const cities = await Store.distinct('city', { isActive: true }); // danh sách tỉnh có chi nhánh
  res.json({ data: cities.sort() });
});

// ---------- QUẢN TRỊ CHI NHÁNH (chỉ admin) ----------
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Admin = require('../models/Admin');
const StoreInventory = require('../models/StoreInventory');
const StaffAssignment = require('../models/StaffAssignment');

const OPEN_ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'ready_for_pickup', 'shipping', 'returning']; // đơn chưa kết thúc
const escapeRegex = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // thoát ký tự đặc biệt

// Kiểm tra dữ liệu chi nhánh. Trước đây tạo / sửa nhận nguyên req.body (không kiểm tra gì, sửa được cả _id,
// createdAt). current = chi nhánh đang sửa (gửi trường nào đổi trường đó). Trả về { data } hoặc { error }.
function parseStore(body, current = null) {
  const merged = { ...(current ? current.toObject() : {}), ...body }; // dữ liệu cũ + mới
  const str = (v, max) => String(v ?? '').trim().slice(0, max); // ép chuỗi, cắt khoảng trắng, giới hạn độ dài
  const data = {
    name: str(merged.name, 120),
    address: str(merged.address, 300),
    city: str(merged.city, 80),
    state: str(merged.state, 80),
    phoneNumber: str(merged.phoneNumber, 20),
    email: str(merged.email, 120).toLowerCase(),
    openHours: str(merged.openHours, 60) || '8:00 - 21:30' // giờ mở cửa mặc định
  };
  if (data.name.length < 3) return { error: 'Tên chi nhánh tối thiểu 3 ký tự' };
  // Địa chỉ / tỉnh bắt buộc khi TẠO MỚI hoặc khi người sửa gửi lên giá trị mới. Chi nhánh cũ (tạo trước khi có
  // kiểm tra) có thể thiếu - không để việc đó chặn các thao tác khác như mở lại, đổi giờ mở cửa.
  const touched = (k) => !current || Object.prototype.hasOwnProperty.call(body, k); // trường này có được gửi lên không
  if (!data.address && touched('address')) return { error: 'Vui lòng nhập địa chỉ chi nhánh' };
  if (!data.city && touched('city')) return { error: 'Vui lòng chọn tỉnh / thành phố' };
  // Số di động / cố định (0..., +84...) hoặc tổng đài 1800 / 1900
  if (data.phoneNumber && touched('phoneNumber') && !/^((0|\+84)[0-9 .-]{8,13}|1[89]00[0-9 .-]{4,8})$/.test(data.phoneNumber)) {
    return { error: 'Số điện thoại không hợp lệ' };
  }
  if (data.email && touched('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return { error: 'Email không hợp lệ' };
  for (const [k, min, max] of [['lat', -90, 90], ['lng', -180, 180]]) { // tọa độ (dùng tính khoảng cách giao hàng)
    const raw = merged[k];
    if (raw === '' || raw === null || raw === undefined) { data[k] = undefined; continue; }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < min || n > max) return { error: k === 'lat' ? 'Vĩ độ phải từ -90 đến 90' : 'Kinh độ phải từ -180 đến 180' };
    data[k] = n;
  }
  if ((data.lat === undefined) !== (data.lng === undefined)) return { error: 'Cần nhập đủ cả vĩ độ và kinh độ (hoặc để trống cả hai)' }; // phải đủ cặp vĩ độ + kinh độ
  if (merged.isActive !== undefined && typeof merged.isActive !== 'boolean') return { error: 'Trạng thái không hợp lệ' };
  data.isActive = merged.isActive !== false;
  return { data };
}

async function nameTaken(name, exceptId) {
  return Store.exists({ name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' }, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }); // trùng tên (không phân biệt hoa thường)
}

// Số liệu nhanh từng chi nhánh: nhân viên, sản phẩm còn hàng, đơn đang xử lý
async function storeStats(storeIds) {
  const ids = storeIds.map((id) => new mongoose.Types.ObjectId(String(id))); // aggregate cần ObjectId
  const now = new Date();
  const [staff, managers, transfers, stock, openOrders] = await Promise.all([
    Admin.aggregate([{ $match: { role: 'staff', isActive: true, storeId: { $in: ids } } }, { $group: { _id: '$storeId', n: { $sum: 1 } } }]), // số nhân viên chính thức
    Admin.aggregate([
      { $match: { role: 'staff', isActive: true, managedStoreIds: { $in: ids } } }, // số người quản lý thêm
      { $unwind: '$managedStoreIds' },
      { $match: { managedStoreIds: { $in: ids } } },
      { $group: { _id: '$managedStoreIds', n: { $sum: 1 } } }
    ]),
    StaffAssignment.aggregate([
      { $match: { kind: 'transfer', cancelled: { $ne: true }, storeId: { $in: ids }, startDate: { $lte: now }, $or: [{ endDate: null }, { endDate: { $gt: now } }] } }, // nhân viên đang điều chuyển tới
      { $group: { _id: '$storeId', n: { $sum: 1 } } }
    ]),
    StoreInventory.aggregate([
      { $match: { storeId: { $in: ids }, stock: { $gt: 0 } } },
      { $group: { _id: '$storeId', products: { $addToSet: '$productId' }, units: { $sum: '$stock' } } } // số sản phẩm còn hàng + tổng số máy
    ]),
    Order.aggregate([{ $match: { storeId: { $in: ids }, status: { $in: OPEN_ORDER_STATUSES } } }, { $group: { _id: '$storeId', n: { $sum: 1 } } }]) // đơn đang xử lý
  ]);
  const map = (rows, f) => new Map(rows.map((r) => [String(r._id), f(r)])); // mảng -> Map tra theo id chi nhánh
  const m = {
    staff: map(staff, (r) => r.n),
    managers: map(managers, (r) => r.n),
    transfers: map(transfers, (r) => r.n),
    stock: map(stock, (r) => ({ products: r.products.length, units: r.units })),
    openOrders: map(openOrders, (r) => r.n)
  };
  return (id) => { // trả về hàm tra số liệu của 1 chi nhánh
    const k = String(id);
    return {
      staff: m.staff.get(k) || 0,
      managers: m.managers.get(k) || 0,
      transfersIn: m.transfers.get(k) || 0,
      productsInStock: m.stock.get(k)?.products || 0,
      unitsInStock: m.stock.get(k)?.units || 0,
      openOrders: m.openOrders.get(k) || 0
    };
  };
}

// Không cho ngưng hoạt động chi nhánh còn đơn đang xử lý (không ai xử lý tiếp) hoặc còn nhân viên làm việc tại đó
async function deactivationBlockers(storeId) {
  const stat = (await storeStats([storeId]))(storeId); // số liệu của chi nhánh cần ngưng
  const reasons = [];
  if (stat.openOrders) reasons.push(`${stat.openOrders} đơn hàng đang xử lý`);
  if (stat.staff) reasons.push(`${stat.staff} nhân viên thuộc chi nhánh (hãy chuyển sang chi nhánh khác)`);
  if (stat.transfersIn) reasons.push(`${stat.transfersIn} nhân viên đang được điều chuyển tới`);
  return reasons.length ? `Chưa thể ngưng hoạt động: còn ${reasons.join(', ')}` : null; // null = được phép ngưng
}

// @route GET /api/stores/admin/all - mọi chi nhánh (cả đã ngưng) kèm số liệu, cho trang quản trị
const adminListStores = asyncHandler(async (req, res) => {
  const stores = await Store.find().sort({ isActive: -1, city: 1, name: 1 }).lean(); // chi nhánh đang mở lên trước
  const stat = await storeStats(stores.map((s) => s._id));
  res.json({ data: stores.map((s) => ({ ...s, stats: stat(s._id) })) });
});

const createStore = asyncHandler(async (req, res) => {
  const { data, error } = parseStore(req.body);
  if (error) return res.status(400).json({ message: error });
  if (await nameTaken(data.name)) return res.status(409).json({ message: `Đã có chi nhánh tên "${data.name}"` }); // không trùng tên
  const store = await Store.create(data);
  res.status(201).json({ data: store });
});

const updateStore = asyncHandler(async (req, res) => {
  const store = mongoose.isValidObjectId(req.params.id) ? await Store.findById(req.params.id) : null;
  if (!store) return res.status(404).json({ message: 'Không tìm thấy cửa hàng' });
  const { data, error } = parseStore(req.body, store);
  if (error) return res.status(400).json({ message: error });
  if (await nameTaken(data.name, store._id)) return res.status(409).json({ message: `Đã có chi nhánh tên "${data.name}"` });
  // Ngưng hoạt động qua PUT { isActive: false } cũng phải qua cùng kiểm tra như DELETE
  if (store.isActive && !data.isActive) { // đang mở -> chuyển sang ngưng
    const blocked = await deactivationBlockers(store._id);
    if (blocked) return res.status(409).json({ message: blocked });
  }
  Object.assign(store, data);
  await store.save();
  res.json({ data: store });
});

const deleteStore = asyncHandler(async (req, res) => {
  const store = mongoose.isValidObjectId(req.params.id) ? await Store.findById(req.params.id) : null;
  if (!store) return res.status(404).json({ message: 'Không tìm thấy cửa hàng' });
  const blocked = await deactivationBlockers(store._id);
  if (blocked) return res.status(409).json({ message: blocked });
  store.isActive = false; // không xóa hẳn (đơn cũ còn tham chiếu), chỉ ngưng hoạt động
  await store.save();
  res.json({ message: 'Đã ngưng hoạt động chi nhánh' });
});

module.exports = { getStores, getCities, adminListStores, createStore, updateStore, deleteStore };
