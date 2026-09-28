const User = require('../models/User');
const Setting = require('../models/Setting');
const { sendMail } = require('./mailer');
const { layout, infoTable, orderItemsTable, plain, esc, vnd } = require('./emailTemplates');

// Email thông báo cho khách (đơn hàng, thanh toán, bảo hành). Gửi CHẠY NỀN: nghiệp vụ chính (đặt hàng, đổi
// trạng thái...) không chờ và không bao giờ thất bại vì email - lỗi gửi chỉ được ghi log.
const ORDER_STATUS = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  processing: 'Đang xử lý',
  shipping: 'Đang giao hàng',
  delivered: 'Đã giao hàng',
  cancelled: 'Đã hủy',
  returned: 'Đã hoàn trả'
};
const ORDER_STATUS_MESSAGE = {
  confirmed: 'Đơn hàng của bạn đã được xác nhận và đang được chuẩn bị.',
  processing: 'Đơn hàng đang được đóng gói tại cửa hàng.',
  shipping: 'Đơn hàng đã được giao cho đơn vị vận chuyển và đang trên đường tới bạn.',
  delivered: 'Đơn hàng đã được giao thành công. Cảm ơn bạn đã mua sắm! Bạn có thể đánh giá sản phẩm ngay trên website.',
  cancelled: 'Đơn hàng đã được hủy.',
  returned: 'Đơn hàng đã được ghi nhận hoàn trả.'
};
const PAYMENT_MODE = { cod: 'Thanh toán khi nhận hàng (COD)', vnpay: 'VNPay', bank_transfer: 'Chuyển khoản', momo: 'MoMo' };
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
  return user?.email ? user : null;
}

function emailOrderPlaced(order) {
  runInBackground(`xác nhận đơn ${order.orderCode}`, async () => {
    const [user, shop] = await Promise.all([recipient(order.userId), shopInfo()]);
    if (!user) return;
    const url = `${clientUrl()}/account/orders/${order._id}`;
    const waitingPayment = order.paymentMode === 'vnpay' && order.paymentStatus !== 'paid';
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

function emailOrderStatus(order, status, note) {
  if (!ORDER_STATUS_MESSAGE[status]) return; // không gửi cho bước "chờ xác nhận"
  runInBackground(`trạng thái đơn ${order.orderCode}`, async () => {
    const [user, shop] = await Promise.all([recipient(order.userId), shopInfo()]);
    if (!user) return;
    const url = `${clientUrl()}/account/orders/${order._id}`;
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
            ['Tổng tiền', vnd(order.grandTotal)],
            ['Ghi chú', status === 'cancelled' ? order.cancelReason || note : note]
          ]) + (refundNote ? `<p style="margin:0 0 16px;font-size:14px">${esc(refundNote)}</p>` : ''),
        cta: { label: status === 'delivered' ? 'Đánh giá sản phẩm' : 'Xem đơn hàng', url }
      }),
      text: plain(`Đơn hàng ${order.orderCode}: ${ORDER_STATUS[status]}`, ORDER_STATUS_MESSAGE[status], refundNote, `Xem đơn hàng: ${url}`)
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

module.exports = { emailOrderPlaced, emailOrderStatus, emailPaymentSuccess, emailWarranty, sendPasswordResetCode, flushEmails };
