// Admin -> Cấu hình hệ thống -> Hóa đơn điện tử: nhà cung cấp (giả lập / Bkav...), người bán, ký hiệu, tự xuất, tự gửi email
const EInvoiceConfig = require('../models/EInvoiceConfig');
const asyncHandler = require('../utils/asyncHandler');
const { encrypt, decrypt } = require('../utils/secretBox');
const { byId, publicProviders } = require('../utils/einvoiceProviders');

// Cấu hình trả về trình duyệt: KHÔNG có bí mật, chỉ cờ "đã lưu"
function safe(doc) {
  const providers = {};
  for (const p of publicProviders()) {
    const st = (doc.providers || {})[p.id] || {};
    providers[p.id] = { values: { ...(st.values || {}) }, secretsSet: Object.fromEntries(p.fields.filter((f) => f.secret).map((f) => [f.key, Boolean(st[`${f.key}Enc`])])) };
  }
  return { activeProvider: doc.activeProvider || 'simulation', seller: doc.seller || {}, template: doc.template || '1', series: doc.series || '', autoIssue: !!doc.autoIssue, autoEmail: doc.autoEmail !== false, providers, updatedAt: doc.updatedAt };
}

// @route GET /api/settings/einvoice
const getConfig = asyncHandler(async (req, res) => {
  const doc = (await EInvoiceConfig.findOne().lean()) || {};
  res.json({ data: { config: safe(doc), providers: publicProviders() } });
});

// @route PUT /api/settings/einvoice
const updateConfig = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const doc = (await EInvoiceConfig.findOne()) || new EInvoiceConfig();
  if (b.activeProvider !== undefined) {
    if (!byId(b.activeProvider)) return res.status(400).json({ message: 'Nhà cung cấp không hợp lệ' });
    doc.activeProvider = b.activeProvider;
  }
  const str = (v, max = 300) => String(v ?? '').trim().slice(0, max);
  if (b.seller) {
    const tax = str(b.seller.taxCode, 14);
    if (tax && !/^\d{10}(-\d{3})?$/.test(tax)) return res.status(400).json({ message: 'Mã số thuế người bán phải gồm 10 số (hoặc 10 số - 3 số chi nhánh)' });
    if (b.seller.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(b.seller.email))) return res.status(400).json({ message: 'Email người bán không hợp lệ' });
    doc.seller = { companyName: str(b.seller.companyName, 200), taxCode: tax, address: str(b.seller.address), phone: str(b.seller.phone, 30), email: str(b.seller.email, 120), bankAccount: str(b.seller.bankAccount, 120) };
  }
  if (b.template !== undefined) doc.template = str(b.template, 5) || '1';
  if (b.series !== undefined) {
    const s = str(b.series, 8).toUpperCase();
    if (s && !/^[CK]\d{2}[TDLMNBGH][A-Z0-9]{2}$/.test(s)) return res.status(400).json({ message: 'Ký hiệu hóa đơn phải dạng C26TAA (C/K + 2 số năm + loại T/D/L/M/N/B/G/H + 2 ký tự)' });
    doc.series = s;
  }
  if (b.autoIssue !== undefined) doc.autoIssue = b.autoIssue === true;
  if (b.autoEmail !== undefined) doc.autoEmail = b.autoEmail === true;
  // Cấu hình riêng từng nhà cung cấp: trường thường lưu thẳng; trường bí mật mã hóa, để trống = giữ nguyên
  if (b.providers && typeof b.providers === 'object') {
    const all = { ...(doc.providers || {}) };
    for (const [id, input] of Object.entries(b.providers)) {
      const p = byId(id);
      if (!p || !input) continue;
      const cur = { ...(all[id] || {}), values: { ...((all[id] || {}).values || {}) } };
      for (const f of p.fields) {
        const v = input.values?.[f.key];
        if (f.secret) { if (typeof v === 'string' && v.trim()) cur[`${f.key}Enc`] = encrypt(v.trim()); if (input.clear?.[f.key]) delete cur[`${f.key}Enc`]; }
        else if (v !== undefined) cur.values[f.key] = str(v, 500);
      }
      all[id] = cur;
    }
    doc.providers = all;
    doc.markModified('providers');
  }
  // Bật nhà cung cấp thật phải đủ trường bắt buộc
  const active = byId(doc.activeProvider);
  const st = (doc.providers || {})[doc.activeProvider] || {};
  const missing = active.fields.filter((f) => f.required && !(f.secret ? st[`${f.key}Enc`] : st.values?.[f.key]));
  if (missing.length) return res.status(400).json({ message: `${active.name} còn thiếu: ${missing.map((f) => f.label).join(', ')}` });
  doc.updatedBy = req.account._id;
  await doc.save();
  res.json({ data: { config: safe(doc.toObject()), providers: publicProviders() }, message: 'Đã lưu cấu hình hóa đơn điện tử' });
});

// @route POST /api/settings/einvoice/test { provider, values? } - kiểm tra kết nối (dùng giá trị đang nhập, bí mật trống = dùng đã lưu)
const testConfig = asyncHandler(async (req, res) => {
  const p = byId(req.body?.provider);
  if (!p) return res.status(400).json({ message: 'Nhà cung cấp không hợp lệ' });
  const doc = (await EInvoiceConfig.findOne().lean()) || {};
  const st = (doc.providers || {})[p.id] || {};
  const cfg = { values: { ...(st.values || {}) } };
  for (const f of p.fields) {
    const v = req.body.values?.[f.key];
    if (f.secret) cfg[f.key] = (typeof v === 'string' && v.trim()) ? v.trim() : decrypt(st[`${f.key}Enc`]) || '';
    else cfg.values[f.key] = v !== undefined && v !== '' ? String(v) : (cfg.values[f.key] || f.default || '');
  }
  res.json({ data: await p.test(cfg) });
});

module.exports = { getConfig, updateConfig, testConfig };
