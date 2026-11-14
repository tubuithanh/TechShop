// DANH SÁCH NHÀ CUNG CẤP HÓA ĐƠN ĐIỆN TỬ. Thêm nhà cung cấp mới: khai báo 1 phần tử { id, name, fields, test, issue }
// - giao diện Cấu hình hệ thống tự hiện form theo `fields`.
//   field: { key, label, type: 'text'|'password'|'url', secret?, required?, placeholder?, help?, default? }
//   issue(cfg, invoiceDoc) -> { number, series, template, taxAuthorityCode, lookupCode, providerRef, raw } (hoặc throw)
const crypto = require('crypto');
const zlib = require('zlib');

// ================= BKAV eHoadon =================
// Tích hợp qua web service SOAP: ExecCommand(partnerGUID, CommandData)
//   CommandData = Base64( AES-256-CBC( GZip( JSON CommandObject ) ) ), khóa + IV lấy từ PartnerToken dạng "KEY_BASE64:IV_BASE64"
//   Kết quả trả về mã hóa cùng cách. Tham số theo tài liệu tích hợp Bkav (bản demo: wsdemo.ehoadon.vn).
// LƯU Ý: chưa được kiểm chứng với tài khoản Bkav thật trong dự án - cần PartnerGUID / PartnerToken demo do Bkav cấp.
function bkavKeys(token) {
  const [k, iv] = String(token || '').split(':');
  const key = Buffer.from(k || '', 'base64'); const ivBuf = Buffer.from(iv || '', 'base64');
  if (key.length !== 32 || ivBuf.length !== 16) throw new Error('PartnerToken không đúng dạng KEY:IV (khóa 32 byte, IV 16 byte, mã hóa base64)');
  return { key, iv: ivBuf };
}
function bkavEncode(obj, token) {
  const { key, iv } = bkavKeys(token);
  const c = crypto.createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([c.update(zlib.gzipSync(Buffer.from(JSON.stringify(obj), 'utf8'))), c.final()]).toString('base64');
}
function bkavDecode(b64, token) {
  const { key, iv } = bkavKeys(token);
  const d = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const plain = Buffer.concat([d.update(Buffer.from(b64, 'base64')), d.final()]);
  return JSON.parse(zlib.gunzipSync(plain).toString('utf8'));
}
async function bkavCall(cfg, commandObject) {
  const url = cfg.values.apiUrl || 'https://wsdemo.ehoadon.vn/WSPublicEHoaDon.asmx';
  const data = bkavEncode(commandObject, cfg.partnerToken);
  const body = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ExecCommand xmlns="http://tempuri.org/"><partnerGUID>${cfg.values.partnerGUID}</partnerGUID><CommandData>${data}</CommandData></ExecCommand></soap:Body></soap:Envelope>`;
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: 'http://tempuri.org/ExecCommand' }, body, signal: AbortSignal.timeout(20000) });
  } catch (err) { throw new Error(`Không kết nối được Bkav (${url}): ${err.name === 'TimeoutError' ? 'quá thời gian chờ' : err.message}`); }
  const text = await res.text();
  if (!res.ok) throw new Error(`Bkav trả lỗi HTTP ${res.status}`);
  const m = text.match(/<ExecCommandResult>([\s\S]*?)<\/ExecCommandResult>/);
  if (!m) throw new Error('Phản hồi Bkav không đúng định dạng');
  let out;
  try { out = bkavDecode(m[1].trim(), cfg.partnerToken); } catch { throw new Error('Không giải mã được phản hồi Bkav - kiểm tra lại PartnerToken'); }
  if (out.isError || out.Status !== 0) throw new Error(`Bkav: ${typeof out.Object === 'string' ? out.Object : JSON.stringify(out.Object || out).slice(0, 300)}`);
  return out;
}
// Hóa đơn TechShop -> CommandObject Bkav (CmdType 112: tạo và phát hành hóa đơn có mã CQT, Bkav cấp số)
function bkavInvoice(doc, cfg) {
  return {
    CmdType: Number(cfg.values.cmdType || 112),
    CommandObject: [{
      Invoice: {
        InvoiceTypeID: 1, InvoiceDate: doc.issuedAt.toISOString(), BuyerName: doc.buyer.name || '', BuyerTaxCode: doc.buyer.taxCode || '',
        BuyerUnitName: doc.buyer.companyName || '', BuyerAddress: doc.buyer.address || '', BuyerBankAccount: '', PayMethodID: doc.paymentMethod === 'CK' ? 2 : doc.paymentMethod === 'TM' ? 1 : 3,
        ReceiveTypeID: 3, ReceiverEmail: doc.buyer.email || '', ReceiverMobile: doc.buyer.phone || '', ReceiverAddress: doc.buyer.address || '', ReceiverName: doc.buyer.name || '',
        Note: `Đơn hàng ${doc.orderCode}`, BillCode: doc.orderCode, CurrencyID: 'VND', ExchangeRate: 1,
        InvoiceForm: cfg.values.invoiceForm || doc.template, InvoiceSerial: cfg.values.invoiceSerial || doc.series, InvoiceNo: 0, OriginalInvoiceIdentify: ''
      },
      ListInvoiceDetailsWS: doc.lines.map((l) => ({ ItemName: l.name, UnitName: l.unit, Qty: l.quantity, Price: l.unitPrice, Amount: l.amount, TaxRateID: l.vatRate === 0 ? 1 : l.vatRate === 5 ? 2 : l.vatRate === 8 ? 9 : 3, TaxAmount: l.vatAmount, IsDiscount: false, IsIncrease: null })),
      ListInvoiceAttachFileWS: [], PartnerInvoiceID: 0, PartnerInvoiceStringID: String(doc.orderId)
    }]
  };
}

const PROVIDERS = [
  {
    id: 'simulation',
    name: 'Hóa đơn giả lập',
    badge: 'Mặc định',
    description: 'TechShop tự cấp số, mã CQT giả lập, mã tra cứu và ký số (HMAC). Không gửi lên cơ quan thuế - dùng để demo / kiểm thử.',
    fields: [],
    test: async () => ({ ok: true, message: 'Chế độ giả lập luôn sẵn sàng' })
  },
  {
    id: 'bkav',
    name: 'Bkav eHoadon',
    badge: 'Tích hợp thử',
    description: 'Phát hành hóa đơn qua web service Bkav eHoadon (SOAP ExecCommand, dữ liệu GZip + AES theo PartnerToken). Cần PartnerGUID và PartnerToken do Bkav cấp (bản demo hoặc chính thức).',
    docs: 'https://ehoadon.vn',
    fields: [
      { key: 'apiUrl', label: 'Địa chỉ web service', type: 'url', default: 'https://wsdemo.ehoadon.vn/WSPublicEHoaDon.asmx', help: 'Demo: wsdemo.ehoadon.vn · Chính thức: ws.ehoadon.vn' },
      { key: 'partnerGUID', label: 'PartnerGUID', type: 'text', required: true, placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
      { key: 'partnerToken', label: 'PartnerToken', type: 'password', secret: true, required: true, placeholder: 'KEY_BASE64:IV_BASE64', help: 'Lưu mã hóa, để trống = giữ giá trị đã lưu' },
      { key: 'invoiceForm', label: 'Mẫu số trên Bkav', type: 'text', default: '1' },
      { key: 'invoiceSerial', label: 'Ký hiệu trên Bkav', type: 'text', placeholder: 'VD C26TAA' },
      { key: 'cmdType', label: 'Mã lệnh phát hành (CmdType)', type: 'text', default: '112', help: 'Theo tài liệu Bkav: 112 = tạo + phát hành HĐ có mã CQT' }
    ],
    // Kiểm tra: gọi lệnh lấy trạng thái 1 hóa đơn không tồn tại - nhận được phản hồi giải mã được là khóa đúng
    test: async (cfg) => {
      if (!cfg.values.partnerGUID || !cfg.partnerToken) return { ok: false, message: 'Nhập PartnerGUID và PartnerToken trước' };
      try { bkavKeys(cfg.partnerToken); } catch (e) { return { ok: false, message: e.message }; }
      try {
        await bkavCall(cfg, { CmdType: 801, CommandObject: [{ PartnerInvoiceID: 0, PartnerInvoiceStringID: 'techshop-test' }] });
        return { ok: true, message: 'Kết nối và giải mã phản hồi Bkav thành công' };
      } catch (e) {
        // Bkav trả "không tìm thấy hóa đơn" nghĩa là đã xác thực được -> coi là kết nối tốt
        if (/Bkav:/.test(e.message)) return { ok: true, message: `Đã xác thực với Bkav (phản hồi: ${e.message.replace('Bkav: ', '').slice(0, 120)})` };
        return { ok: false, message: e.message };
      }
    },
    issue: async (cfg, doc) => {
      const out = await bkavCall(cfg, bkavInvoice(doc, cfg));
      const r = Array.isArray(out.Object) ? out.Object[0] : out.Object || {};
      if (r.Status && r.Status !== 0) throw new Error(`Bkav: ${r.MessLog || 'phát hành thất bại'}`);
      return {
        number: Number(r.InvoiceNo) || null, series: r.InvoiceSerial || cfg.values.invoiceSerial || doc.series, template: r.InvoiceForm || cfg.values.invoiceForm || doc.template,
        taxAuthorityCode: r.MTC || r.MaCQT || r.InvoiceCode || '', lookupCode: r.InvoiceGUID ? String(r.InvoiceGUID).replace(/-/g, '').slice(0, 10).toUpperCase() : null,
        providerRef: r.InvoiceGUID || '', raw: r
      };
    }
  }
];

const byId = (id) => PROVIDERS.find((p) => p.id === id);
const publicProviders = () => PROVIDERS.map(({ id, name, badge, description, docs, fields }) => ({ id, name, badge, description, docs, fields: fields.map(({ key, label, type, secret, required, placeholder, help, default: def }) => ({ key, label, type, secret: !!secret, required: !!required, placeholder, help, default: def })) }));

module.exports = { PROVIDERS, byId, publicProviders, bkavEncode, bkavDecode };
