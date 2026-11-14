const User = require('../models/User');
const Order = require('../models/Order');
const Setting = require('../models/Setting');
const { sendMail } = require('./mailer');
const { layout, infoTable, orderItemsTable, plain, esc, vnd } = require('./emailTemplates');

// Email thông báo cho khách (đơn hàng, thanh toán, bảo hành). Gửi CHẠY NỀN: nghiệp vụ chính (đặt hàng, đổi
// trạng thái...) không chờ và không bao giờ thất bại vì email - lỗi gửi chỉ được ghi log.
const ORDER_STATUS = {
  ready_for_pickup: 'Sẵn sàng nhận tại cửa hàng',
  returning: 'Chờ nhận hàng trả về',
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  processing: 'Đang xử lý',
  shipping: 'Đang giao hàng',
  delivered: 'Đã giao hàng',
  cancelled: 'Đã hủy',
  returned: 'Đã hoàn trả'
};
const ORDER_STATUS_MESSAGE = {
  ready_for_pickup: 'Hàng đã được chuẩn bị xong. Bạn vui lòng đến cửa hàng đã chọn để nhận hàng.',
  returning: 'Đơn hàng đang chờ cửa hàng tiếp nhận hàng trả về.',
  confirmed: 'Đơn hàng của bạn đã được xác nhận và đang được chuẩn bị.',
  processing: 'Đơn hàng đang được đóng gói tại cửa hàng.',
  shipping: 'Đơn hàng đã được giao cho đơn vị vận chuyển và đang trên đường tới bạn.',
  delivered: 'Đơn hàng đã được giao thành công. Cảm ơn bạn đã mua sắm! Bạn có thể đánh giá sản phẩm ngay trên website.',
  cancelled: 'Đơn hàng đã được hủy.',
  returned: 'Đơn hàng đã được ghi nhận hoàn trả.'
};
const PAYMENT_MODE = { cash: 'Tiền mặt tại quầy', cod: 'Thanh toán khi nhận hàng (COD)', vnpay: 'VNPay', bank_transfer: 'Chuyển khoản', momo: 'MoMo' };
const WARRANTY_STATUS = {
  received: 'Đã tiếp nhận',
  checking: 'Đang kiểm tra',
  repairing: 'Đang sửa chữa',
  waiting_parts: 'Chờ linh kiện',
  done: 'Đã sửa xong',
  returned: 'Đã trả máy'
};

const clientUrl = () => (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');

async function shopInfo() {
  const s = await Setting.findOne().select('siteName hotline contactEmail').lean();
  return { name: s?.siteName || 'TechShop', hotline: s?.hotline || '1900 0000', email: s?.contactEmail || '' };
}

// Chạy nền + theo dõi để test có thể chờ các email đang gửi (flushEmails)
const pending = new Set();
function runInBackground(label, task) {
  const p = (async () => {
    try {
      await task();
    } catch (err) {
      console.error(`[EMAIL] Không gửi được email ${label}:`, err.message);
    }
  })();
  pending.add(p);
  p.finally(() => pending.delete(p));
}
const flushEmails = () => Promise.all([...pending]);

async function recipient(userId) {
  const user = await User.findById(userId).select('email displayName').lean();
  // Email tạm của tài khoản Zalo không nhận được thư -> bỏ qua (tránh gửi lỗi / bị đánh dấu spam)
  return user?.email && !User.isPlaceholderEmail(user.email) ? user : null;
}

function emailOrderPlaced(order) {
  runInBackground(`xác nhận đơn ${order.orderCode}`, async () => {
    const [user, shop] = await Promise.all([recipient(order.userId), shopInfo()]);
    if (!user) return;
    const url = `${clientUrl()}/account/orders/${order._id}`;
    const waitingPayment = Order.ONLINE_PAYMENT_MODES.includes(order.paymentMode) && order.paymentStatus !== 'paid';
    await sendMail({
      to: user.email,
      subject: `Xác nhận đơn hàng ${order.orderCode} - ${shop.name}`,
      html: layout({
        shop,
        title: 'Đặt hàng thành công',
        intro: `Xin chào ${esc(user.displayName || 'bạn')}, ${esc(shop.name)} đã nhận được đơn hàng <strong>${esc(order.orderCode)}</strong> của bạn.${
          waitingPayment ? ' Đơn sẽ được xử lý sau khi bạn hoàn tất thanh toán VNPay.' : ''
        }`,
        body:
          orderItemsTable(order) +
          infoTable([
            ['Hình thức nhận hàng', order.deliveryMethod === 'store_pickup' ? 'Nhận tại cửa hàng' : 'Giao tận nơi'],
            ['Người nhận', order.deliveryAddress?.fullName],
            ['Số điện thoại', order.deliveryAddress?.phone],
            ['Thanh toán', PAYMENT_MODE[order.paymentMode] || order.paymentMode]
          ]),
        cta: { label: 'Xem đơn hàng', url }
      }),
      text: plain(
        `Đặt hàng thành công - đơn ${order.orderCode}`,
        ...(order.items || []).map((i) => `- ${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ''} x${i.quantity}: ${vnd(i.unitPrice * i.quantity)}`),
        `Tổng cộng: ${vnd(order.grandTotal)}`,
        `Xem đơn hàng: ${url}`
      )
    });
  });
}

// Đơn giao qua đơn vị vận chuyển: tên đơn vị, mã vận đơn, link trang theo dõi công khai
function trackingInfo(order) {
  const s = order.shipment;
  if (!s?.code || !['simulation', 'sandbox'].includes(s.environment) || !['active', undefined].includes(s.phase)) return null;
  return { carrier: s.environment === 'simulation' ? 'Giao Hàng Nhanh (giả lập)' : 'Giao Hàng Nhanh', code: s.code, url: `${clientUrl()}/van-chuyen/${encodeURIComponent(s.code)}` };
}

// Email báo các bước của vận đơn (đang giao tới, giao thất bại, chuyển hoàn) - utils/shipmentNotify.js
function emailShipmentEvent(order, { title, message }) {
  runInBackground(`vận đơn ${order.orderCode}`, async () => {
    const [user, shop] = await Promise.all([recipient(order.userId), shopInfo()]);
    if (!user) return;
    const tracking = trackingInfo(order);
    const url = tracking?.url || `${clientUrl()}/account/orders/${order._id}`;
    await sendMail({
      to: user.email,
      subject: `Đơn hàng ${order.orderCode}: ${title} - ${shop.name}`,
      html: layout({
        shop,
        title,
        intro: `Xin chào ${esc(user.displayName || 'bạn')}, ${esc(message)}`,
        body: infoTable([
          ['Mã đơn hàng', order.orderCode],
          ...(tracking ? [['Đơn vị vận chuyển', tracking.carrier], ['Mã vận đơn', tracking.code]] : [])
        ]),
        cta: { label: 'Theo dõi vận chuyển', url }
      }),
      text: plain(`Đơn hàng ${order.orderCode}: ${title}`, message, `Theo dõi: ${url}`)
    });
  });
}

function emailOrderStatus(order, status, note) {
  if (!ORDER_STATUS_MESSAGE[status]) return; // không gửi cho bước "chờ xác nhận"
  runInBackground(`trạng thái đơn ${order.orderCode}`, async () => {
    const [user, shop] = await Promise.all([recipient(order.userId), shopInfo()]);
    if (!user) return;
    const url = `${clientUrl()}/account/orders/${order._id}`;
    const tracking = status === 'shipping' ? trackingInfo(order) : null;
    const refundNote =
      ['cancelled', 'returned'].includes(status) && order.paymentStatus === 'refunded'
        ? 'Số tiền bạn đã thanh toán online sẽ được hoàn về đúng tài khoản/thẻ đã dùng trong 7-15 ngày làm việc.'
        : '';
    await sendMail({
      to: user.email,
      subject: `Đơn hàng ${order.orderCode}: ${ORDER_STATUS[status]} - ${shop.name}`,
      html: layout({
        shop,
        title: `Đơn hàng ${ORDER_STATUS[status].toLowerCase()}`,
        intro: `Xin chào ${esc(user.displayName || 'bạn')}, ${esc(ORDER_STATUS_MESSAGE[status])}`,
        body:
          infoTable([
            ['Mã đơn hàng', order.orderCode],
            ['Trạng thái', ORDER_STATUS[status]],
            ...(tracking ? [['Đơn vị vận chuyển', tracking.carrier], ['Mã vận đơn', tracking.code]] : []),
            ['Tổng tiền', vnd(order.grandTotal)],
            ['Ghi chú', status === 'cancelled' ? order.cancelReason || note : note]
          ]) + (refundNote ? `<p style="margin:0 0 16px;font-size:14px">${esc(refundNote)}</p>` : ''),
        cta: tracking ? { label: 'Theo dõi vận chuyển', url: tracking.url } : { label: status === 'delivered' ? 'Đánh giá sản phẩm' : 'Xem đơn hàng', url }
      }),
      text: plain(`Đơn hàng ${order.orderCode}: ${ORDER_STATUS[status]}`, ORDER_STATUS_MESSAGE[status], refundNote, tracking ? `Theo dõi vận chuyển (${tracking.carrier}, mã ${tracking.code}): ${tracking.url}` : '', `Xem đơn hàng: ${url}`)
    });
  });
}

function emailPaymentSuccess(order) {
  runInBackground(`thanh toán đơn ${order.orderCode}`, async () => {
    const [user, shop] = await Promise.all([recipient(order.userId), shopInfo()]);
    if (!user) return;
    const url = `${clientUrl()}/account/orders/${order._id}`;
    await sendMail({
      to: user.email,
      subject: `Thanh toán thành công đơn hàng ${order.orderCode} - ${shop.name}`,
      html: layout({
        shop,
        title: 'Thanh toán thành công',
        intro: `Xin chào ${esc(user.displayName || 'bạn')}, ${esc(shop.name)} đã nhận được thanh toán cho đơn hàng <strong>${esc(order.orderCode)}</strong>. Đơn hàng sẽ sớm được xác nhận và chuẩn bị.`,
        body: infoTable([
          ['Mã đơn hàng', order.orderCode],
          ['Số tiền', vnd(order.grandTotal)],
          ['Cổng thanh toán', 'VNPay'],
          ['Mã giao dịch', order.paymentInfo?.transactionNo],
          ['Ngân hàng', order.paymentInfo?.bankCode]
        ]),
        cta: { label: 'Xem đơn hàng', url }
      }),
      text: plain(`Thanh toán thành công đơn ${order.orderCode}: ${vnd(order.grandTotal)} qua VNPay`, `Xem đơn hàng: ${url}`)
    });
  });
}

// created=true: vừa tạo phiếu; ngược lại: phiếu đổi trạng thái
function emailWarranty(warranty, { created = false, note } = {}) {
  runInBackground(`bảo hành ${warranty.ticketCode}`, async () => {
    const [user, shop] = await Promise.all([recipient(warranty.userId), shopInfo()]);
    if (!user) return;
    const url = `${clientUrl()}/tra-cuu-bao-hanh?code=${encodeURIComponent(warranty.ticketCode)}`;
    const statusLabel = WARRANTY_STATUS[warranty.status] || warranty.status;
    await sendMail({
      to: user.email,
      subject: created
        ? `Đã tiếp nhận yêu cầu bảo hành ${warranty.ticketCode} - ${shop.name}`
        : `Phiếu bảo hành ${warranty.ticketCode}: ${statusLabel} - ${shop.name}`,
      html: layout({
        shop,
        title: created ? 'Đã tiếp nhận yêu cầu bảo hành' : 'Cập nhật tiến độ bảo hành',
        intro: created
          ? `Xin chào ${esc(user.displayName || 'bạn')}, ${esc(shop.name)} đã tiếp nhận yêu cầu bảo hành của bạn. Hãy lưu lại mã phiếu để tra cứu tiến độ.`
          : `Xin chào ${esc(user.displayName || 'bạn')}, phiếu bảo hành của bạn vừa được cập nhật.`,
        body: infoTable([
          ['Mã phiếu', warranty.ticketCode],
          ['Sản phẩm', warranty.productName],
          ['Trạng thái', statusLabel],
          ['Chi phí sửa chữa', warranty.cost > 0 ? vnd(warranty.cost) : ''],
          ['Ghi chú', note]
        ]),
        cta: { label: 'Tra cứu bảo hành', url },
        footerNote: 'Khi tra cứu, nhập mã phiếu và số điện thoại bạn đã dùng khi đặt hàng.'
      }),
      text: plain(`Phiếu bảo hành ${warranty.ticketCode} (${warranty.productName}): ${statusLabel}`, note, `Tra cứu: ${url}`)
    });
  });
}

// Email mã OTP đặt lại mật khẩu (gọi trực tiếp, KHÔNG chạy nền - khách cần biết nếu gửi lỗi)
async function sendPasswordResetCode(email, code, { expiresMinutes }) {
  const shop = await shopInfo();
  await sendMail({
    to: email,
    subject: `${code} là mã đặt lại mật khẩu ${shop.name}`,
    html: layout({
      shop,
      title: 'Đặt lại mật khẩu',
      intro: 'Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản dùng email này. Mã xác thực của bạn là:',
      body: `<p style="margin:0 0 16px;font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;background:#f4f5f7;border-radius:8px;padding:14px 0">${esc(code)}</p>
        <p style="margin:0 0 8px;font-size:14px">Mã có hiệu lực trong <strong>${expiresMinutes} phút</strong> và chỉ dùng được một lần.</p>
        <p style="margin:0;font-size:14px;color:#6b7280">Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này - mật khẩu của bạn vẫn giữ nguyên. Không chia sẻ mã cho bất kỳ ai.</p>`
    }),
    text: plain(`Mã đặt lại mật khẩu của bạn là: ${code}`, `Mã có hiệu lực trong ${expiresMinutes} phút.`, 'Nếu bạn không yêu cầu, hãy bỏ qua email này.')
  });
}

// Email mã OTP xác nhận đổi email (gửi tới email MỚI; gọi trực tiếp để khách biết nếu gửi lỗi)
async function sendChangeEmailCode(email, code, { expiresMinutes }) {
  const shop = await shopInfo();
  await sendMail({
    to: email,
    subject: `${code} là mã xác nhận email mới tại ${shop.name}`,
    html: layout({
      shop,
      title: 'Xác nhận email mới',
      intro: 'Bạn vừa yêu cầu dùng email này cho tài khoản của mình. Mã xác nhận của bạn là:',
      body: `<p style="margin:0 0 16px;font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;background:#f4f5f7;border-radius:8px;padding:14px 0">${esc(code)}</p>
        <p style="margin:0 0 8px;font-size:14px">Mã có hiệu lực trong <strong>${expiresMinutes} phút</strong> và chỉ dùng được một lần.</p>
        <p style="margin:0;font-size:14px;color:#6b7280">Nếu bạn không yêu cầu, hãy bỏ qua email này. Không chia sẻ mã cho bất kỳ ai.</p>`
    }),
    text: plain(`Mã xác nhận email mới của bạn là: ${code}`, `Mã có hiệu lực trong ${expiresMinutes} phút.`, 'Nếu bạn không yêu cầu, hãy bỏ qua email này.')
  });
}

// Chào mừng thành viên mới tạo tại quầy: hướng dẫn tự đặt mật khẩu (thu ngân không biết mật khẩu)
function emailCounterWelcome(user, order) {
  runInBackground(`chào mừng thành viên ${user.email}`, async () => {
    const shop = await shopInfo();
    const url = `${clientUrl()}/forgot-password`;
    await sendMail({
      to: user.email,
      subject: `Chào mừng bạn trở thành thành viên ${shop.name}`,
      html: layout({
        shop,
        title: 'Chào mừng thành viên mới',
        intro: `Xin chào ${esc(user.displayName || 'bạn')}, cửa hàng đã tạo tài khoản thành viên cho bạn khi mua đơn <strong>${esc(order.orderCode)}</strong>.`,
        body: `<p style="margin:0 0 12px;font-size:14px">Đơn hàng, điểm thưởng và sổ bảo hành điện tử đã được lưu trong tài khoản.</p>
          <p style="margin:0 0 16px;font-size:14px">Để đăng nhập, hãy đặt mật khẩu bằng chức năng <strong>Quên mật khẩu</strong> với email này:</p>
          <p style="text-align:center;margin:0 0 16px"><a href="${url}" style="background:#d70018;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Đặt mật khẩu</a></p>`
      }),
      text: plain(`Cửa hàng đã tạo tài khoản thành viên cho bạn (đơn ${order.orderCode}).`, `Đặt mật khẩu tại: ${url}`)
    });
  });
}

// Gửi hóa đơn điện tử (giả lập) cho người mua: tóm tắt + link tra cứu bằng mã tra cứu
function emailEInvoice(inv) {
  runInBackground(`hóa đơn ${inv.series}-${inv.number}`, async () => {
    const EInvoice = require('../models/EInvoice');
    const shop = await shopInfo();
    const url = `${clientUrl()}/tra-cuu-hoa-don?code=${inv.lookupCode}`;
    const no = String(inv.number).padStart(8, '0');
    await sendMail({
      to: inv.buyer.email,
      subject: `Hóa đơn điện tử ${inv.series} số ${no} - ${shop.name}`,
      html: layout({
        shop,
        title: 'Hóa đơn điện tử',
        intro: `Kính gửi ${esc(inv.buyer.companyName || inv.buyer.name || 'Quý khách')}, ${esc(shop.name)} gửi hóa đơn giá trị gia tăng cho đơn hàng <strong>${esc(inv.orderCode)}</strong>.`,
        body: `${infoTable([
          ['Ký hiệu', `${inv.template}${inv.series}`], ['Số hóa đơn', no], ['Ngày lập', new Date(inv.issuedAt).toLocaleDateString('vi-VN')],
          ['Mã của CQT', inv.taxAuthorityCode], ['Tổng tiền thanh toán', vnd(inv.totals.total)], ['Mã tra cứu', inv.lookupCode]
        ])}
          <p style="text-align:center;margin:16px 0"><a href="${url}" style="background:#d70018;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Xem hóa đơn</a></p>
          <p style="margin:0;font-size:12px;color:#6b7280">Đây là hóa đơn điện tử GIẢ LẬP phục vụ kiểm thử, không có giá trị kê khai thuế.</p>`
      }),
      text: plain(`Hóa đơn ${inv.template}${inv.series} số ${no}`, `Tổng tiền: ${vnd(inv.totals.total)}`, `Mã tra cứu: ${inv.lookupCode}`, `Xem tại: ${url}`)
    });
    // Gửi được mới ghi nhận (trước đây ghi "đã gửi" ngay cả khi máy chủ email lỗi)
    await EInvoice.updateOne({ _id: inv._id }, { emailedTo: inv.buyer.email, emailedAt: new Date() });
  });
}

module.exports = {
  emailEInvoice,
  emailCounterWelcome,
  emailShipmentEvent,
  trackingInfo,
  emailOrderPlaced,
  emailOrderStatus,
  emailPaymentSuccess,
  emailWarranty,
  sendPasswordResetCode,
  sendChangeEmailCode,
  flushEmails
};
