// SƠ ĐỒ QUY TRÌNH ĐƠN HÀNG (đầu trang Đơn hàng): các bước nối mũi tên, mỗi bước có người phụ trách + số đơn,
// bấm để lọc. Kèm phần "Mỗi bước làm gì?" mở / đóng được (nhớ lựa chọn).
import { useState } from 'react';
import { Collapse } from 'react-bootstrap';
import { ArrowRight, QuestionCircle, ChevronDown, ChevronUp, Truck, Shop } from 'react-bootstrap-icons';

// [trạng thái, tên bước, ai phụ trách, việc cần làm, màu]
const STEPS = {
  pending: ['Chờ xác nhận', 'Bán hàng / CSKH', 'Gọi khách xác nhận đơn, kiểm tra địa chỉ. Đơn VNPay/MoMo chỉ xác nhận được khi khách đã thanh toán; chuyển khoản cần kế toán xác nhận tiền trước khi giao.', 'warning'],
  confirmed: ['Đã xác nhận', 'Kho', 'Lấy hàng khỏi kệ, kiểm tra máy, chuẩn bị phụ kiện. Bấm "Bắt đầu chuẩn bị hàng".', 'info'],
  processing: ['Đang chuẩn bị', 'Kho / Quản lý', 'Đóng gói. Giao tận nơi: quản lý phân công shipper hoặc gửi đơn vị vận chuyển. Nhận tại cửa hàng: bấm "Sẵn sàng cho khách nhận".', 'info'],
  shipping: ['Đang giao', 'Shipper / Đơn vị VC', 'Shipper giao hàng, chụp ảnh bàn giao, thu tiền COD. Giao lỗi 3 lần hoặc khách từ chối -> chuyển hoàn.', 'primary'],
  ready_for_pickup: ['Chờ khách lấy', 'Nhân viên quầy', 'Khách đến cửa hàng: kiểm tra người nhận, thu tiền nếu chưa trả, bấm "Bàn giao cho khách".', 'primary'],
  delivered: ['Hoàn tất', 'Kế toán', 'Đối soát tiền COD, xuất hóa đơn điện tử. Khách được tích điểm và có sổ bảo hành.', 'success'],
  returning: ['Chờ nhận hàng trả', 'Kho', 'Kiểm đếm hàng trả về, bấm "Đã nhận hàng trả" -> hệ thống hoàn kho. Đơn đã thu tiền chuyển sang chờ hoàn tiền.', 'warning'],
  returned: ['Đã nhận hàng trả', 'Kế toán', 'Hoàn tiền cho khách (nếu đã thu), hủy / thay thế hóa đơn.', 'secondary'],
  cancelled: ['Đã hủy', '—', 'Tồn kho, lượt mã giảm giá đã được trả lại tự động. Đơn đã thu tiền chuyển sang chờ hoàn tiền.', 'danger']
};
const GUIDE_KEY = 'orders.guideOpen';
const readGuide = () => { try { return localStorage.getItem(GUIDE_KEY) === '1'; } catch { return false; } };

function Step({ status, counts, active, onPick, small }) {
  const [label, who, , tone] = STEPS[status];
  const n = counts[status] || 0;
  return (
    <button type="button" onClick={() => onPick(active ? '' : status)} title={STEPS[status][2]}
      className={`order-pipe-step border rounded-3 text-start px-2 py-1 bg-body ${active ? `border-${tone} border-2 shadow-sm` : ''} ${n ? '' : 'opacity-75'}`}
      style={{ minWidth: small ? 120 : 132 }}>
      <div className="d-flex align-items-center gap-1">
        <span className={`rounded-circle bg-${tone}`} style={{ width: 8, height: 8 }} />
        <span className="small fw-semibold text-nowrap">{label}</span>
        <span className={`ms-auto badge rounded-pill ${n ? `text-bg-${tone}` : 'text-bg-light border'}`}>{n}</span>
      </div>
      <div className="text-muted text-nowrap" style={{ fontSize: '0.72rem' }}>{who}</div>
    </button>
  );
}

export default function OrderPipeline({ counts = {}, status = '', onPick }) {
  const [open, setOpen] = useState(readGuide);
  const toggle = () => setOpen((o) => { try { localStorage.setItem(GUIDE_KEY, o ? '0' : '1'); } catch { /* bỏ qua */ } return !o; });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const arrow = <ArrowRight className="text-muted flex-shrink-0" />;
  const p = { counts, onPick };
  return (
    <div className="border rounded-3 p-2 mb-3 bg-body-tertiary">
      <div className="d-flex align-items-center mb-2 gap-2 flex-wrap">
        <span className="fw-semibold small">Quy trình đơn hàng</span>
        <button type="button" className={`btn btn-sm ${!status ? 'btn-dark' : 'btn-outline-secondary'} py-0`} onClick={() => onPick('')}>Tất cả <span className="badge text-bg-light ms-1">{total}</span></button>
        <span className="small text-muted d-none d-md-inline">Bấm 1 bước để xem các đơn đang ở bước đó</span>
        <button type="button" className="btn btn-sm btn-link ms-auto py-0" onClick={toggle} aria-expanded={open}>
          <QuestionCircle className="me-1" />Mỗi bước làm gì? {open ? <ChevronUp /> : <ChevronDown />}
        </button>
      </div>

      {/* Luồng chính + rẽ nhánh giao tận nơi / nhận tại cửa hàng */}
      <div className="d-flex align-items-center gap-2 overflow-auto pb-1">
        <Step status="pending" active={status === 'pending'} {...p} />{arrow}
        <Step status="confirmed" active={status === 'confirmed'} {...p} />{arrow}
        <Step status="processing" active={status === 'processing'} {...p} />{arrow}
        <div className="d-flex flex-column gap-1">
          <div className="d-flex align-items-center gap-1"><Truck className="text-muted flex-shrink-0" size={12} /><Step status="shipping" active={status === 'shipping'} small {...p} /></div>
          <div className="d-flex align-items-center gap-1"><Shop className="text-muted flex-shrink-0" size={12} /><Step status="ready_for_pickup" active={status === 'ready_for_pickup'} small {...p} /></div>
        </div>
        {arrow}
        <Step status="delivered" active={status === 'delivered'} {...p} />
        <span className="vr mx-1" />
        <div className="d-flex flex-column gap-1">
          <Step status="returning" active={status === 'returning'} small {...p} />
          <div className="d-flex gap-1">
            <Step status="returned" active={status === 'returned'} small {...p} />
            <Step status="cancelled" active={status === 'cancelled'} small {...p} />
          </div>
        </div>
      </div>

      <Collapse in={open}>
        <div>
          <div className="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-2 mt-1 small">
            {Object.entries(STEPS).map(([k, [label, who, todo, tone]]) => (
              <div key={k} className="col">
                <div className={`h-100 border-start border-3 border-${tone} ps-2`}>
                  <div className="fw-semibold">{label} <span className="text-muted fw-normal">· {who}</span></div>
                  <div className="text-muted">{todo}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="small text-muted mt-2">Đơn <b>bán tại quầy (POS)</b> hoàn tất ngay khi thanh toán. Khách tự hủy được khi đơn còn "Chờ xác nhận" / "Đã xác nhận"; sau đó chỉ nhân viên hủy (bắt buộc ghi lý do).</div>
        </div>
      </Collapse>
    </div>
  );
}
