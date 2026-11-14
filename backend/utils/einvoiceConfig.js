// Cấu hình hóa đơn điện tử đang dùng (đọc từ EInvoiceConfig, giải mã bí mật). Chưa có bản ghi -> mặc định GIẢ LẬP.
const EInvoiceConfig = require('../models/EInvoiceConfig');
const { decrypt } = require('./secretBox');
const { byId } = require('./einvoiceProviders');

async function getEInvoiceConfig() {
  const doc = (await EInvoiceConfig.findOne().lean()) || {};
  const active = byId(doc.activeProvider) ? doc.activeProvider : 'simulation';
  const provider = byId(active);
  const stored = (doc.providers || {})[active] || {};
  const providerCfg = { values: { ...(stored.values || {}) } };
  for (const f of provider.fields) {
    if (f.secret) providerCfg[f.key] = decrypt(stored[`${f.key}Enc`]) || '';
    else if (providerCfg.values[f.key] == null || providerCfg.values[f.key] === '') providerCfg.values[f.key] = f.default ?? '';
  }
  return {
    activeProvider: active, provider, providerCfg,
    seller: doc.seller || {}, template: doc.template || '1', series: doc.series || '',
    autoIssue: doc.autoIssue === true, autoEmail: doc.autoEmail !== false
  };
}

module.exports = { getEInvoiceConfig };
