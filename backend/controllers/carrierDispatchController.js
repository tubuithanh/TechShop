// Phân công giao hàng cho ĐƠN VỊ VẬN CHUYỂN theo cấu hình (Admin -> Cấu hình hệ thống -> Đơn vị giao hàng).
//   - Giả lập: vận đơn mô phỏng trong TechShop (simulatedShipmentController.dispatch)
//   - GHN sandbox: tạo vận đơn thật trên môi trường test của GHN (shipmentController.create), đồng bộ trạng thái mỗi phút
const Order = require('../models/Order');
const ghn = require('../utils/ghn');
const routing = require('../utils/deliveryRouting');
const { inScope } = require('./orderController');
const { historyEntry } = require('../utils/orderHistory');
const { BusinessError } = require('../utils/transaction');
const asyncHandler = require('../utils/asyncHandler');
const { getShippingConfig } = require('../utils/shippingConfig');
const { assignmentEntry, assignedBySet } = require('../utils/assignmentLog');
const shipments = require('./shipmentController');
const simulated = require('./simulatedShipmentController');

const fail = (status, message) => { throw new BusinessError(status, message); };
async function read(req) {
  const order = await Order.findById(req.params.orderId);
  if (!order) fail(404, 'Không tìm thấy đơn');
  if (!inScope(req, order)) fail(403, 'Đơn thuộc chi nhánh khác');
  return order;
}

// GHN dùng được cho chi nhánh của đơn chưa: có token + chi nhánh đã ghép Shop ID
async function ghnAvailability(order) {
  const cfg = await getShippingConfig();
  const g = cfg.settings.ghn_sandbox || {};
  if (!g.token) return { available: false, reason: 'Chưa nhập Token GHN (Cấu hình hệ thống -> Đơn vị giao hàng)' };
  if (!g.shops?.[String(order.storeId?._id || order.storeId)]) return { available: false, reason: 'Chi nhánh của đơn chưa có Shop ID GHN' };
  return { available: true };
}

// @route GET /api/deliveries/:orderId/carriers - các cách giao dùng được cho đơn này + cách mặc định
const carrierOptions = asyncHandler(async (req, res) => {
  const order = await read(req);
  const cfg = await getShippingConfig();
  const ghnState = await ghnAvailability(order);
  const options = [
    { id: 'internal', label: 'Shop tự giao (nhân viên chi nhánh)', kind: 'internal', available: true },
    { id: 'simulation', label: 'Đơn vị vận chuyển - giả lập', kind: 'carrier', available: true, note: 'Mô phỏng vận đơn trong TechShop, không gửi sang đơn vị thật' },
    { id: 'ghn_sandbox', label: 'Giao Hàng Nhanh (GHN) - sandbox', kind: 'carrier', ...ghnState, note: 'Tạo vận đơn thật trên môi trường test của GHN' }
  ];
  const preferred = cfg.provider === 'ghn_sandbox' && ghnState.available ? 'ghn_sandbox' : 'simulation';
  res.json({ data: { options, defaultMethod: order.shipperId ? 'internal' : preferred, activeProvider: cfg.provider } });
});

// Kiểm tra mã địa chỉ GHN (tỉnh / quận / phường) thuộc danh mục GHN và khớp tỉnh/thành của đơn
async function ghnAddress(order, body) {
  const provinces = await ghn.locations('provinces');
  const matches = (p, name) => [p.ProvinceName, ...(p.NameExtension || [])].some((n) => routing.provinceKey(n) === routing.provinceKey(name));
  const to = provinces.find((p) => p.ProvinceID === Number(body.provinceId));
  if (!to || !matches(to, order.deliveryAddress?.city)) fail(400, 'Tỉnh/thành GHN phải khớp địa chỉ nhận hàng của đơn');
  const district = (await ghn.locations('districts', to.ProvinceID)).find((d) => d.DistrictID === Number(body.districtId));
  const ward = district && (await ghn.locations('wards', district.DistrictID)).find((w) => w.WardCode === String(body.wardCode));
  if (!district || !ward) fail(400, 'Quận/huyện hoặc phường/xã không thuộc tỉnh đã chọn');
  return { to, district, ward };
}

// @route POST /api/deliveries/:orderId/carriers/ghn/fee { provinceId, districtId, wardCode, weight, length, width, height }
// Phí vận chuyển GHN ước tính trước khi tạo vận đơn
const ghnFee = asyncHandler(async (req, res) => {
  const order = await read(req);
  const state = await ghnAvailability(order);
  if (!state.available) fail(400, state.reason);
  const { district, ward } = await ghnAddress(order, req.body);
  const shop = await ghn.shopFor(order.storeId);
  const n = (k, def) => (Number.isInteger(Number(req.body[k])) && Number(req.body[k]) > 0 ? Number(req.body[k]) : def);
  const data = await ghn.call('/v2/shipping-order/fee', {
    shopId: shop._id,
    body: {
      service_type_id: 2, from_district_id: shop.district_id, from_ward_code: shop.ward_code,
      to_district_id: district.DistrictID, to_ward_code: ward.WardCode,
      weight: n('weight', 500), length: n('length', 20), width: n('width', 15), height: n('height', 10),
      insurance_value: Math.min(Math.round(order.grandTotal), 5000000),
      cod_value: order.paymentStatus === 'paid' ? 0 : Math.round(order.grandTotal)
    }
  });
  res.json({ data: { total: data?.total ?? null, serviceFee: data?.service_fee ?? null, insuranceFee: data?.insurance_fee ?? null } });
});

// Tạo vận đơn GHN sandbox: lập phương án giao "ghn" theo địa chỉ GHN đã chọn rồi gọi tạo vận đơn
async function dispatchGhn(req, res, next) {
  const order = await read(req);
  if (order.deliveryMethod !== 'home_delivery' || order.activeTransferId || routing.activeShipment(order)) fail(409, 'Đơn chưa thể phân công hoặc đang có vận đơn hoạt động');
  if (order.status !== 'processing') fail(400, 'Chuyển đơn sang "Đang chuẩn bị" (đã đóng gói) trước khi tạo vận đơn GHN');
  const state = await ghnAvailability(order);
  if (!state.available) fail(400, state.reason);
  const body = req.body.ghn || {};
  const { to, district, ward } = await ghnAddress(order, body);
  const plan = {
    storeId: order.storeId, addressKey: routing.addressKey(order), mode: 'ghn', assignmentMode: 'manager_choice',
    provinceId: to.ProvinceID, districtId: district.DistrictID, wardCode: ward.WardCode,
    provinceName: to.ProvinceName, districtName: district.DistrictName, wardName: ward.WardName,
    verifiedBy: req.account._id, verifiedAt: new Date()
  };
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, __v: order.__v, status: order.status, activeTransferId: null, ...routing.shipmentGuard(order) },
    { $set: { deliveryPlan: plan, shipperId: null, ...assignedBySet(req) }, $inc: { __v: 1 },
      $push: {
        statusHistory: historyEntry(req, order.status, `Chọn GHN sandbox - giao tới ${ward.WardName}, ${district.DistrictName}, ${to.ProvinceName}`),
        assignmentLog: assignmentEntry(req, { action: 'carrier', method: 'ghn_sandbox', note: `${ward.WardName}, ${district.DistrictName}, ${to.ProvinceName}` })
      } },
    { new: true }
  );
  if (!updated) fail(409, 'Đơn vừa thay đổi, hãy tải lại');
  // Tạo vận đơn (cùng kiểm tra / chống tạo trùng của luồng GHN sẵn có); kích thước kiện hàng lấy từ body.ghn
  req.body = { weight: body.weight, length: body.length, width: body.width, height: body.height };
  return shipments.create(req, res, next);
}

// @route POST /api/deliveries/:orderId/dispatch { method: 'internal' | 'simulation' | 'ghn_sandbox', shipperId?, ghn? }
// ('ghn' của giao diện cũ = giả lập)
const dispatch = (req, res, next) => {
  const method = req.body?.method;
  if (method === 'ghn_sandbox') return Promise.resolve(dispatchGhn(req, res, next)).catch(next);
  if (method === 'simulation') req.body.method = 'ghn';
  return simulated.dispatch(req, res, next);
};

module.exports = { carrierOptions, ghnFee, dispatch, ghnAvailability };
