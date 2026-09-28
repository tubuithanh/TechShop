// Mẫu email dùng chung (HTML dạng bảng + CSS inline để hiển thị đúng trên Gmail/Outlook/điện thoại).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')}đ`;
const RED = '#d7261e';

// Khung chung: đầu thư tên shop, nội dung, nút hành động, chân thư (hotline + ghi chú email tự động)
function layout({ shop, title, intro, body = '', cta, footerNote }) {
  const button = cta
    ? `<p style="margin:24px 0 8px;text-align:center"><a href="${esc(cta.url)}" style="display:inline-block;background:${RED};color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:8px">${esc(cta.label)}</a></p>`
    : '';
  return `<!doctype html>
<html lang="vi"><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
        <tr><td style="background:${RED};color:#ffffff;padding:18px 24px;font-size:20px;font-weight:bold">${esc(shop.name)}</td></tr>
        <tr><td style="padding:24px">
          <h1 style="margin:0 0 12px;font-size:20px">${esc(title)}</h1>
          ${intro ? `<p style="margin:0 0 16px;line-height:1.6">${intro}</p>` : ''}
          ${body}
          ${button}
        </td></tr>
        <tr><td style="padding:16px 24px;background:#f9fafb;font-size:12px;color:#6b7280;line-height:1.6">
          ${footerNote ? `${footerNote}<br>` : ''}
          Cần hỗ trợ? Gọi tổng đài <strong>${esc(shop.hotline)}</strong>${shop.email ? ` hoặc email ${esc(shop.email)}` : ''}.<br>
          Đây là email tự động từ ${esc(shop.name)}, vui lòng không trả lời email này.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// Bảng thông tin dạng "nhãn: giá trị"
function infoTable(rows) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:14px">${rows
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `<tr><td style="padding:4px 0;color:#6b7280;width:40%">${esc(k)}</td><td style="padding:4px 0;font-weight:bold">${esc(v)}</td></tr>`)
    .join('')}</table>`;
}

// Danh sách sản phẩm + tổng tiền của đơn hàng
function orderItemsTable(order) {
  const items = (order.items || [])
    .map(
      (i) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee">${esc(i.name)}${i.variantLabel ? `<br><span style="color:#6b7280;font-size:13px">${esc(i.variantLabel)}</span>` : ''}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center;white-space:nowrap">x${esc(i.quantity)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${vnd(i.unitPrice * i.quantity)}</td>
      </tr>`
    )
    .join('');
  const line = (label, value, bold) =>
    `<tr><td colspan="2" style="padding:4px 0;${bold ? 'font-weight:bold' : 'color:#6b7280'}">${label}</td><td style="padding:4px 0;text-align:right;${bold ? `font-weight:bold;color:${RED}` : ''}">${value}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:14px">
    ${items}
    ${line('Tạm tính', vnd(order.itemsTotal))}
    ${line('Phí vận chuyển', vnd(order.shippingFee))}
    ${order.discountAmount ? line('Giảm giá', `-${vnd(order.discountAmount)}`) : ''}
    ${line('Tổng cộng', vnd(order.grandTotal), true)}
  </table>`;
}

// Bản chữ thuần (text) đi kèm - hiển thị khi ứng dụng email không đọc được HTML
const plain = (...lines) => lines.filter(Boolean).join('\n');

module.exports = { layout, infoTable, orderItemsTable, plain, esc, vnd };
