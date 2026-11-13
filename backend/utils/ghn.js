const { httpJson } = require('./httpJson');
const { BusinessError } = require('./transaction');
const BASE = 'https://dev-online-gateway.ghn.vn/shiip/public-api';
const cache = new Map();
const { ghnSettings } = require('./shippingConfig');

// token: truyền khi kiểm tra cấu hình CHƯA lưu; bỏ trống = token đang áp dụng (Admin -> Đơn vị giao hàng / GHN_TOKEN)
async function call(path, { shopId, body, query, token } = {}) {
  const apiToken = token || (await ghnSettings()).token;
  if (!apiToken) throw new BusinessError(503, 'Chưa cấu hình GHN sandbox (Admin -> Cấu hình hệ thống -> Đơn vị giao hàng)');
  // This implementation is deliberately sandbox-only; a production token must not create real shipments.
  const url = new URL(BASE + path);
  for (const [key, value] of Object.entries(query || {})) url.searchParams.set(key, value);
  let response;
  try { response = await httpJson(url, { method: body ? 'POST' : 'GET', headers: { Token: apiToken, ...(shopId ? { ShopId: String(shopId) } : {}) }, body }); }
  catch { throw new BusinessError(502, 'Không nhận được kết quả GHN. Chưa xác định yêu cầu đã thành công hay chưa; hãy đồng bộ/thử lại cùng yêu cầu.'); }
  if (response.status !== 200 || response.data.code !== 200) {
    const err = new BusinessError(502, `GHN: ${String(response.data.code_message_value || response.data.message || 'Yêu cầu bị từ chối').slice(0, 400)}`);
    err.definite = response.status >= 400 && response.status < 500;
    throw err;
  }
  return response.data.data;
}
async function locations(kind, parent) {
  const paths = { provinces: '/master-data/province', districts: '/master-data/district', wards: '/master-data/ward' };
  if (!paths[kind]) throw new BusinessError(400, 'Loại địa chỉ không hợp lệ');
  if (kind !== 'provinces' && (!Number.isInteger(Number(parent)) || Number(parent) < 1)) throw new BusinessError(400, 'Chọn tỉnh/quận trước');
  const key = `${kind}:${parent || ''}`;
  if (cache.get(key)?.until > Date.now()) return cache.get(key).data;
  const data = await call(paths[kind], { query: kind === 'provinces' ? {} : { [kind === 'districts' ? 'province_id' : 'district_id']: parent } });
  cache.set(key, { data, until: Date.now() + 3600000 });
  return data;
}
async function shopFor(storeId) {
  const mapping = (await ghnSettings()).shops || {};
  if (mapping.__invalid) throw new BusinessError(503, 'Cấu hình chi nhánh GHN không hợp lệ');
  const id = mapping[String(storeId)] || null;
  if (!id) throw new BusinessError(400, 'Chi nhánh này chưa có Shop ID GHN sandbox. Cần cấu hình địa chỉ lấy hàng đúng chi nhánh.');
  const data = await call('/v2/shop/all', { query: { offset: 0, limit: 100 } });
  const shop = data.shops?.find(s => String(s._id) === String(id) && s.status === 1);
  if (!shop?.address || !shop.district_id || !shop.ward_code) throw new BusinessError(400, 'Cửa hàng GHN chưa hoạt động hoặc thiếu địa chỉ lấy hàng');
  return shop;
}
module.exports = {
  call, locations, shopFor,
  create: (shopId, body) => call('/v2/shipping-order/create', { shopId, body }),
  detail: (shopId, code) => call('/v2/shipping-order/detail', { shopId, query: { order_code: code } }),
  cancel: (shopId, code) => call('/v2/switch-status/cancel', { shopId, body: { order_codes: [code], reason_code: 'GHN-CANCEL-OTHER', reason: 'TechShop sandbox: huy truoc khi ban giao' } })
};
