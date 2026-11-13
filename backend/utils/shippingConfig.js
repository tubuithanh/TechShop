// Cấu hình giao hàng ĐANG ÁP DỤNG - mọi nơi cần biết đơn vị giao hàng / token GHN đều đọc qua đây (không đọc
// thẳng process.env nữa). Ưu tiên cấu hình admin lưu trong database (mode 'custom'); chưa lưu hoặc chọn
// "Dùng biến môi trường" thì đọc SHIPPING_PROVIDER / GHN_* như trước.
const ShippingConfig = require('../models/ShippingConfig');
const { decrypt } = require('./secretBox');
const { byId } = require('./shippingProviders');

const DEFAULT_ROUTING = 'https://router.project-osrm.org';

function envShops() {
  let shops = {};
  try { shops = JSON.parse(process.env.GHN_SHOPS_JSON || '{}') || {}; } catch { shops = { __invalid: true }; }
  if (process.env.GHN_STORE_ID && process.env.GHN_SHOP_ID && !shops[process.env.GHN_STORE_ID]) shops[process.env.GHN_STORE_ID] = process.env.GHN_SHOP_ID;
  return shops;
}

function fromEnv() {
  return {
    source: 'env',
    provider: process.env.SHIPPING_PROVIDER || 'simulation',
    settings: { ghn_sandbox: { token: process.env.GHN_TOKEN || '', shops: envShops() } },
    routingApiUrl: process.env.ROUTING_API_URL || DEFAULT_ROUTING
  };
}

// Giải mã các trường bí mật (xxxEnc -> xxx) theo mô tả đơn vị giao hàng
function decodeProviderSettings(id, stored = {}) {
  const def = byId(id);
  const out = { shops: { ...(stored.shops || {}) } };
  for (const f of def?.fields || []) {
    out[f.key] = f.secret ? decrypt(stored[`${f.key}Enc`] || '') || '' : stored[f.key] || '';
  }
  return out;
}

function fromDoc(doc) {
  if (!doc || doc.mode !== 'custom') return fromEnv();
  const settings = {};
  for (const [id, stored] of Object.entries(doc.providers || {})) settings[id] = decodeProviderSettings(id, stored);
  return {
    source: 'custom',
    provider: doc.activeProvider || 'simulation',
    settings,
    routingApiUrl: doc.routingApiUrl || process.env.ROUTING_API_URL || DEFAULT_ROUTING
  };
}

// Đệm bản ghi DB 30 giây; biến môi trường luôn đọc mới
const CACHE_MS = 30 * 1000;
let cache = null;
async function getShippingConfig() {
  // Chưa kết nối database (đang khởi động, mất kết nối, kiểm thử không dùng DB) -> dùng biến môi trường thay vì
  // chờ Mongoose xếp hàng truy vấn tới khi hết thời gian
  if (require('mongoose').connection.readyState !== 1) return fromDoc(cache?.doc);
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    cache = { doc: await ShippingConfig.findOne().lean().catch(() => null), at: Date.now() };
  }
  return fromDoc(cache.doc);
}
function clearShippingConfigCache() {
  cache = null;
}

const activeProvider = async () => (await getShippingConfig()).provider;
const isGhnActive = async () => (await activeProvider()) === 'ghn_sandbox';
async function ghnSettings() {
  return (await getShippingConfig()).settings.ghn_sandbox || { token: '', shops: {} };
}

module.exports = { getShippingConfig, clearShippingConfigCache, activeProvider, isGhnActive, ghnSettings, fromDoc, fromEnv, decodeProviderSettings, DEFAULT_ROUTING };
