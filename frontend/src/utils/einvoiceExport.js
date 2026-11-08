import { downloadXlsx, formatDateVN } from './xlsxWriter';

// Chuyển đơn hàng thành file Excel để IMPORT lên hệ thống hóa đơn điện tử (MISA meInvoice, Viettel S-Invoice,
// VNPT, BKAV...). Mẫu chung theo NĐ 123/2020 & TT 78/2021:
//  - Mỗi dòng = 1 dòng hàng hóa; các dòng cùng "Mã đơn hàng" gộp thành 1 hóa đơn khi import
//  - Giá bán của TechShop ĐÃ GỒM VAT -> tách ra Đơn giá chưa thuế / Thành tiền chưa thuế / Tiền thuế theo đúng
//    VAT đã chốt của từng dòng lúc đặt hàng (item.vat, đã trừ phần giảm giá phân bổ cho dòng đó)
//  - Phí vận chuyển là 1 dòng dịch vụ riêng với thuế suất VAT phí giao hàng (Cấu hình -> Thuế VAT)
// Mỗi nhà cung cấp đặt tên cột hơi khác nhau: khi import chỉ cần "ghép cột" (mapping) 1 lần trên cổng HĐĐT.

const PAYMENT_FORM = { cod: 'TM/CK', cash: 'TM', bank_transfer: 'CK', vnpay: 'CK', momo: 'CK' };

const round = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;

// Tách 1 khoản tiền ĐÃ GỒM thuế thành { net, vat } với thuế suất rate (%)
function splitIncluded(gross, rate) {
  const vat = rate > 0 ? Math.round((gross * rate) / (100 + rate)) : 0;
  return { net: gross - vat, vat };
}

function buyerAddress(o) {
  if (o.invoiceInfo?.address) return o.invoiceInfo.address;
  const a = o.deliveryAddress || {};
  return [a.addressLine1, a.addressLine2, a.state, a.city].filter(Boolean).join(', ');
}

export const EINVOICE_COLUMNS = [
  { header: 'Mã đơn hàng (nhóm hóa đơn)', width: 20 },
  { header: 'Ngày hóa đơn', width: 13 },
  { header: 'Họ tên người mua', width: 22 },
  { header: 'Tên đơn vị', width: 30 },
  { header: 'Mã số thuế', width: 15 },
  { header: 'Địa chỉ', width: 40 },
  { header: 'Số điện thoại', width: 14 },
  { header: 'Email nhận hóa đơn', width: 26 },
  { header: 'Hình thức thanh toán', width: 12 },
  { header: 'Loại tiền', width: 9 },
  { header: 'STT dòng', width: 8 },
  { header: 'Tính chất', width: 16 },
  { header: 'Mã hàng', width: 14 },
  { header: 'Tên hàng hóa, dịch vụ', width: 42 },
  { header: 'Đơn vị tính', width: 10 },
  { header: 'Số lượng', width: 9 },
  { header: 'Đơn giá (chưa thuế)', width: 16, money: true },
  { header: 'Thành tiền (chưa thuế)', width: 18, money: true },
  { header: 'Thuế suất (%)', width: 10 },
  { header: 'Tiền thuế GTGT', width: 15, money: true },
  { header: 'Tổng tiền thanh toán', width: 18, money: true },
  { header: 'Ghi chú', width: 24 }
];

// Các dòng Excel của 1 đơn hàng
export function orderToRows(o, shippingVatRate = 10) {
  const inv = o.invoiceInfo || {};
  const buyerName = o.deliveryAddress?.fullName || o.userId?.displayName || 'Người mua không lấy hóa đơn';
  const head = [
    o.orderCode,
    formatDateVN(o.createdAt),
    buyerName,
    inv.companyName || '',
    inv.taxCode || '',
    buyerAddress(o),
    o.deliveryAddress?.phone || o.userId?.phoneNumber || '',
    inv.email || o.userId?.email || '',
    PAYMENT_FORM[o.paymentMode] || 'TM/CK',
    'VND'
  ];

  const rows = (o.items || []).map((it, i) => {
    const gross = it.unitPrice * it.quantity - (it.discountAmount || 0);
    // Đơn mới: VAT đã chốt lúc đặt; đơn cũ (trước khi có VAT theo dòng): tính lại theo 10%
    const rate = it.vat?.rate ?? 10;
    const { net, vat } = it.vat ? { net: it.vat.netAmount, vat: it.vat.amount } : splitIncluded(gross, rate);
    return [
      ...head,
      i + 1,
      'Hàng hóa, dịch vụ',
      String(it.variantId || it.productId || '').slice(-8).toUpperCase(),
      it.variantLabel ? `${it.name} (${it.variantLabel})` : it.name,
      'Cái',
      it.quantity,
      round(net / it.quantity, 2),
      net,
      rate,
      vat,
      net + vat,
      it.discountAmount ? `Đã trừ giảm giá ${it.discountAmount.toLocaleString('vi-VN')}đ` : ''
    ];
  });

  // Phí ship thực thu = tổng đơn - tiền hàng (đã trừ giảm giá) -> tổng các dòng luôn khớp đúng grandTotal,
  // kể cả trường hợp mã giảm giá lớn hơn tiền hàng (phần dư trừ vào phí ship - xem backend/utils/vat.js)
  const allHaveVat = (o.items || []).every((it) => it.vat);
  const shipGross = allHaveVat
    ? Math.max(0, o.grandTotal - (o.items || []).reduce((s, it) => s + it.vat.taxableTotal, 0))
    : o.shippingFee || 0;
  if (shipGross > 0) {
    const { net, vat } = splitIncluded(shipGross, shippingVatRate);
    rows.push([...head, rows.length + 1, 'Hàng hóa, dịch vụ', 'SHIP', 'Phí vận chuyển', 'Lần', 1, net, net, shippingVatRate, vat, shipGross, '']);
  }
  return rows;
}

// Tải toàn bộ đơn khớp bộ lọc (API trả tối đa 200 đơn/lần -> gọi lần lượt từng trang)
export async function fetchAllOrders(fetchPage, params, { max = 5000, onProgress } = {}) {
  const all = [];
  for (let page = 1; ; page++) {
    const res = await fetchPage({ ...params, page, limit: 200 });
    all.push(...res.data);
    onProgress?.(all.length, res.total);
    if (all.length >= res.total || res.data.length === 0 || all.length >= max) return { orders: all, total: res.total };
  }
}

export function exportEInvoiceFile(orders, { shippingVatRate = 10, filename } = {}) {
  const rows = orders.flatMap((o) => orderToRows(o, shippingVatRate));
  const today = new Date();
  const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  downloadXlsx(filename || `hoa-don-dien-tu_${stamp}.xlsx`, [
    { name: 'HoaDon', columns: EINVOICE_COLUMNS, rows },
    {
      name: 'HuongDan',
      columns: [{ header: 'Hướng dẫn import lên hệ thống hóa đơn điện tử', width: 110 }],
      rows: [
        ['1. Mỗi dòng ở sheet "HoaDon" là 1 dòng hàng hóa; các dòng có cùng "Mã đơn hàng" thuộc cùng 1 hóa đơn.'],
        ['2. Giá trên website đã gồm VAT; file đã tách sẵn Đơn giá / Thành tiền chưa thuế và Tiền thuế theo từng dòng.'],
        ['3. Đơn có giảm giá: số tiền giảm đã được trừ thẳng vào thành tiền của từng dòng (xem cột Ghi chú).'],
        ['4. Đơn không có "Tên đơn vị" / "Mã số thuế" là khách cá nhân - xuất hóa đơn cho người mua không cung cấp MST.'],
        ['5. Trên cổng HĐĐT (MISA, Viettel, VNPT, BKAV...): chọn Nhập khẩu từ Excel -> ghép (mapping) các cột theo tên tiêu đề -> kiểm tra -> Phát hành.'],
        [`6. Số đơn: ${orders.length} - Số dòng hàng: ${rows.length} - Xuất lúc ${today.toLocaleString('vi-VN')}`]
      ]
    }
  ]);
  return { orders: orders.length, rows: rows.length };
}
