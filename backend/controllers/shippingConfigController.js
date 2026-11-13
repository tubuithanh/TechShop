// Admin -> Cấu hình hệ thống -> Đơn vị giao hàng: chọn đơn vị giao hàng đang dùng + cấu hình riêng từng đơn vị.

const ShippingConfig = require('../models/ShippingConfig');
const Store = require('../models/Store');
const asyncHandler = require('../utils/asyncHandler');
const { encrypt, decrypt, keySource } = require('../utils/secretBox');
const { PROVIDERS, byId, publicProviders } = require('../utils/shippingProviders');
const { clearShippingConfigCache, fromEnv, decodeProviderSettings, DEFAULT_ROUTING } = require('../utils/shippingConfig');

const URL_RE = /^https?:\/\/[^\s]+$/i;
const mask = (v) => (v ? `${String(v).slice(0, 4)}******` : '');

// Dữ liệu trả về trình duyệt: KHÔNG kèm giá trị trường bí mật, chỉ cho biết đã lưu / đọc được hay chưa
function publicView(doc) {
  const d = doc || {};
  const env = fromEnv();
  const providers = {};
  for (const p of PROVIDERS) {
    const stored = d.providers?.[p.id] || {};
    const values = {};
    const secrets = {};
    for (const f of p.fields) {
      if (f.secret) {
        const enc = stored[`${f.key}Enc`];
        secrets[f.key] = { saved: Boolean(enc), unreadable: Boolean(enc && !decrypt(enc)) };
      } else {
        values[f.key] = stored[f.key] || '';
      }
    }
    providers[p.id] = { values, secrets, shops: stored.shops || {} };
  }
  return {
    mode: d.mode || 'env',
    activeProvider: d.activeProvider || 'simulation',
    providers,
    routingApiUrl: d.routingApiUrl || '',
    defaultRoutingApiUrl: DEFAULT_ROUTING,
    env: {
      provider: env.provider,
      ghnToken: mask(env.settings.ghn_sandbox.token),
      ghnShops: Object.keys(env.settings.ghn_sandbox.shops || {}).filter((k) => k !== '__invalid').length
    },
    encryptionKey: keySource(),
    updatedAt: d.updatedAt || null
  };
}

// Kiểm tra cấu hình 1 đơn vị. body = { values: {...}, shops: { storeId: shopId } }. Trường bí mật để trống = giữ giá trị cũ.
// Trả về { error } hoặc { stored } (dạng lưu DB: bí mật đã mã hóa).
function parseProvider(def, body = {}, existing = {}, storeIds, requireComplete) {
  const values = body.values || {};
  const stored = {};
  for (const f of def.fields) {
    const raw = typeof values[f.key] === 'string' ? values[f.key].trim() : '';
    if (raw.length > 500) return { error: `${f.label} quá dài` };
    if (raw && f.pattern && !f.pattern.test(raw)) return { error: `${f.label} không đúng định dạng` };
    if (raw && f.type === 'url' && !URL_RE.test(raw)) return { error: `${f.label} phải bắt đầu bằng http:// hoặc https://` };
    if (f.type === 'select' && raw && !(f.options || []).some((o) => o.value === raw)) return { error: `${f.label} không hợp lệ` };
    if (f.secret) {
      const keep = existing[`${f.key}Enc`] && decrypt(existing[`${f.key}Enc`]);
      if (raw) stored[`${f.key}Enc`] = encrypt(raw);
      else if (keep) stored[`${f.key}Enc`] = existing[`${f.key}Enc`];
      if (requireComplete && f.required && !raw && !keep) return { error: `Vui lòng nhập ${f.label}` };
    } else {
      stored[f.key] = raw;
      if (requireComplete && f.required && !raw) return { error: `Vui lòng nhập ${f.label}` };
    }
  }
  if (def.storeMapping) {
    const shops = {};
    for (const [storeId, rawId] of Object.entries(body.shops || {})) {
      const id = String(rawId ?? '').trim();
      if (!id) continue;
      if (!storeIds.has(storeId)) return { error: 'Chi nhánh không tồn tại' };
      if (def.storeMapping.pattern && !def.storeMapping.pattern.test(id)) return { error: `${def.storeMapping.label} "${id}" không đúng định dạng` };
      shops[storeId] = id;
    }
    if (requireComplete && !Object.keys(shops).length) return { error: `Cần nhập ${def.storeMapping.label} cho ít nhất 1 chi nhánh` };
    stored.shops = shops;
  }
  return { stored };
}

async function storeList() {
  const stores = await Store.find().select('name city isActive').sort({ isActive: -1, name: 1 }).lean();
  return stores.map((s) => ({ _id: String(s._id), name: s.name, city: s.city, isActive: s.isActive !== false }));
}

// @route GET /api/settings/shipping
const getShippingConfig = asyncHandler(async (req, res) => {
  const doc = await ShippingConfig.findOne().lean();
  res.json({ data: { config: publicView(doc), providers: publicProviders(), stores: await storeList() } });
});

// @route PUT /api/settings/shipping { mode, activeProvider, providers: { id: { values, shops } }, routingApiUrl }
const updateShippingConfig = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const mode = body.mode === 'custom' ? 'custom' : body.mode === 'env' ? 'env' : null;
  if (!mode) return res.status(400).json({ message: 'Nguồn cấu hình không hợp lệ' });
  const active = byId(body.activeProvider);
  if (mode === 'custom' && !active) return res.status(400).json({ message: 'Đơn vị giao hàng không hợp lệ' });
  const routingApiUrl = String(body.routingApiUrl || '').trim();
  if (routingApiUrl && !URL_RE.test(routingApiUrl)) return res.status(400).json({ message: 'Địa chỉ dịch vụ tính đường phải bắt đầu bằng http:// hoặc https://' });

  const existing = (await ShippingConfig.findOne().lean()) || {};
  const storeIds = new Set((await Store.find().select('_id').lean()).map((s) => String(s._id)));
  const providers = { ...(existing.providers || {}) };
  for (const def of PROVIDERS) {
    if (!body.providers?.[def.id] && def.id !== active?.id) continue; // không gửi = giữ nguyên
    const parsed = parseProvider(def, body.providers?.[def.id], existing.providers?.[def.id] || {}, storeIds, mode === 'custom' && def.id === active?.id);
    if (parsed.error) return res.status(400).json({ message: `${def.name}: ${parsed.error}` });
    providers[def.id] = parsed.stored;
  }

  const doc = await ShippingConfig.findOneAndUpdate(
    {},
    { $set: { mode, activeProvider: active?.id || existing.activeProvider || 'simulation', providers, routingApiUrl, updatedBy: req.account._id } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  clearShippingConfigCache(); // áp dụng ngay, không chờ hết bộ nhớ đệm
  res.json({ data: { config: publicView(doc) }, message: 'Đã lưu cấu hình giao hàng' });
});

// @route POST /api/settings/shipping/test { provider, values, shops } - kiểm tra kết nối bằng dữ liệu đang nhập
// (chưa cần lưu). Trường bí mật để trống = dùng giá trị đã lưu.
const testShippingConfig = asyncHandler(async (req, res) => {
  const def = byId(req.body?.provider);
  if (!def) return res.status(400).json({ message: 'Đơn vị giao hàng không hợp lệ' });
  if (typeof def.test !== 'function') return res.json({ data: { ok: true, message: `${def.name} không cần kết nối bên ngoài` } });
  const existing = (await ShippingConfig.findOne().lean())?.providers?.[def.id] || {};
  const storeIds = new Set((await Store.find().select('_id').lean()).map((s) => String(s._id)));
  const parsed = parseProvider(def, req.body, existing, storeIds, true);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  try {
    const result = await def.test(decodeProviderSettings(def.id, parsed.stored));
    res.json({ data: result });
  } catch (err) {
    res.json({ data: { ok: false, message: err.message || 'Không kết nối được' } });
  }
});

module.exports = { getShippingConfig, updateShippingConfig, testShippingConfig, publicView };
