import { Badge } from 'react-bootstrap';
import { PatchCheckFill, ExclamationTriangleFill } from 'react-bootstrap-icons';

export const EINVOICE_CSS = ".einvoice{position:relative;background:#fff;color:#111;max-width:900px;margin:0 auto;padding:28px 32px;border:1px solid #d6d6d6;font-family:'Times New Roman',serif;font-size:14px;line-height:1.5;overflow:hidden}\n.einvoice-head{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #0b5e2e;padding-bottom:10px}\n.einvoice-title{font-size:22px;font-weight:700;color:#0b5e2e;letter-spacing:1px}\n.einvoice-buyer{border:1px dashed #bbb;padding:8px 12px;margin-bottom:10px}\n.einvoice-table{width:100%;border-collapse:collapse;font-size:13px}\n.einvoice-table th,.einvoice-table td{border:1px solid #999;padding:4px 6px}\n.einvoice-table th{background:#e9f5ee;text-align:center}\n.einvoice-sign{display:flex;justify-content:space-around;margin-top:18px}\n.einvoice-signbox{margin-top:6px;border:2px solid #198754;color:#198754;padding:6px 10px;font-size:12px;text-align:left;border-radius:4px}\n.einvoice-signbox.bad{border-color:#dc3545;color:#dc3545}\n.einvoice-foot{margin-top:16px;border-top:1px solid #ddd;padding-top:8px;font-size:12px;text-align:center}\n.einvoice-watermark{position:absolute;top:42%;left:50%;transform:translate(-50%,-50%) rotate(-25deg);font-size:110px;font-weight:800;color:rgba(255,193,7,.12);pointer-events:none;white-space:nowrap}\n.einvoice-stamp{position:absolute;top:110px;right:40px;transform:rotate(-12deg);border:4px solid #dc3545;color:#dc3545;font-size:28px;font-weight:800;padding:4px 14px;border-radius:6px;opacity:.75}\n.text-end{text-align:right}.text-center{text-align:center}.text-danger{color:#dc3545}.fw-bold{font-weight:700}.small{font-size:12px}.fst-italic{font-style:italic}";
const vnd = (v) => (v ?? 0).toLocaleString('vi-VN');
const pad = (n) => String(n || 0).padStart(8, '0');
const d = (x) => { const t = new Date(x); return `Ngày ${String(t.getDate()).padStart(2, '0')} tháng ${String(t.getMonth() + 1).padStart(2, '0')} năm ${t.getFullYear()}`; };

// MẪU HÓA ĐƠN GTGT ĐIỆN TỬ (giả lập) - in được (Ctrl+P), dùng chung cho admin, khách và trang tra cứu
export default function EInvoiceView({ inv }) {
  if (!inv) return null;
  const draft = inv.status === 'draft';
  const void_ = !draft && inv.status !== 'issued';
  return (
    <div className="einvoice">
      <style id="einvoice-print-css">{EINVOICE_CSS}</style>
      {void_ && <div className="einvoice-stamp">{inv.status === 'replaced' ? 'ĐÃ BỊ THAY THẾ' : 'ĐÃ HỦY'}</div>}
      <div className="einvoice-watermark">{draft ? 'BẢN NHÁP' : 'GIẢ LẬP'}</div>
      {draft && <div className="einvoice-stamp" style={{ borderColor: '#0d6efd', color: '#0d6efd' }}>CHƯA PHÁT HÀNH</div>}
      <div className="einvoice-head">
        <div>
          <div className="fw-bold">{inv.seller?.name}</div>
          <div>Mã số thuế: <b>{inv.seller?.taxCode}</b></div>
          <div>Địa chỉ: {inv.seller?.address}</div>
          <div>Điện thoại: {inv.seller?.phone}</div>
        </div>
        <div className="text-end">
          <div>Mẫu số: <b>{inv.template}</b></div>
          <div>Ký hiệu: <b>{inv.template}{inv.series}</b></div>
          <div>Số: <b className="text-danger fs-5">{draft ? '(cấp khi phát hành)' : pad(inv.number)}</b></div>
        </div>
      </div>
      <div className="text-center my-3">
        <div className="einvoice-title">HÓA ĐƠN GIÁ TRỊ GIA TĂNG</div>
        <div className="fst-italic">(Bản thể hiện của hóa đơn điện tử)</div>
        <div className="fst-italic">{d(inv.issuedAt)}</div>
        <div className="small">Mã của cơ quan thuế: <b>{draft ? '(cấp khi phát hành)' : inv.taxAuthorityCode}</b></div>
        {inv.type === 'replacement' && <div className="small text-primary">Hóa đơn thay thế cho hóa đơn bị sai sót</div>}
      </div>
      <div className="einvoice-buyer">
        <div>Họ tên người mua hàng: <b>{inv.buyer?.name}</b></div>
        <div>Tên đơn vị: <b>{inv.buyer?.companyName || ''}</b></div>
        <div>Mã số thuế: <b>{inv.buyer?.taxCode || ''}</b></div>
        <div>Địa chỉ: {inv.buyer?.address}</div>
        <div>Hình thức thanh toán: {inv.paymentMethod} · Đồng tiền: {inv.currency} · Đơn hàng: {inv.orderCode}</div>
      </div>
      <table className="einvoice-table">
        <thead>
          <tr><th>STT</th><th>Tên hàng hóa, dịch vụ</th><th>ĐVT</th><th>SL</th><th>Đơn giá</th><th>Chiết khấu</th><th>Thành tiền chưa thuế</th><th>Thuế suất</th><th>Tiền thuế</th></tr>
        </thead>
        <tbody>
          {inv.lines?.map((l) => (
            <tr key={l.no}>
              <td className="text-center">{l.no}</td><td>{l.name}</td><td className="text-center">{l.unit}</td><td className="text-center">{l.quantity}</td>
              <td className="text-end">{vnd(l.unitPrice)}</td><td className="text-end">{l.discount ? vnd(l.discount) : ''}</td>
              <td className="text-end">{vnd(l.amount)}</td><td className="text-center">{l.vatRate}%</td><td className="text-end">{vnd(l.vatAmount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {inv.totals?.byRate?.map((g) => (
            <tr key={g.rate}><td colSpan={6} className="text-end">Tổng hợp thuế suất {g.rate}%</td><td className="text-end">{vnd(g.net)}</td><td /><td className="text-end">{vnd(g.vat)}</td></tr>
          ))}
          <tr className="fw-bold"><td colSpan={6} className="text-end">Cộng tiền hàng (chưa thuế)</td><td className="text-end" colSpan={3}>{vnd(inv.totals?.net)}</td></tr>
          <tr className="fw-bold"><td colSpan={6} className="text-end">Tiền thuế GTGT</td><td className="text-end" colSpan={3}>{vnd(inv.totals?.vat)}</td></tr>
          <tr className="fw-bold fs-6"><td colSpan={6} className="text-end">TỔNG TIỀN THANH TOÁN</td><td className="text-end text-danger" colSpan={3}>{vnd(inv.totals?.total)} đ</td></tr>
        </tfoot>
      </table>
      <div className="mt-2">Số tiền viết bằng chữ: <b><i>{inv.amountInWords}</i></b></div>
      <div className="einvoice-sign">
        <div className="text-center"><b>Người mua hàng</b><div className="small fst-italic">(Ký, ghi rõ họ tên)</div></div>
        <div className="text-center">
          <b>Người bán hàng</b>
          <div className={`einvoice-signbox ${inv.signatureValid === false ? 'bad' : ''}`}>
            {draft ? 'Chưa ký - ký số khi phát hành' : <>{inv.signatureValid === false ? <ExclamationTriangleFill /> : <PatchCheckFill />}{' '}{inv.signatureValid === false ? 'Chữ ký không hợp lệ' : 'Signature Valid'}</>}
            <div>Ký bởi: {inv.seller?.name}</div>
            <div>Ký ngày: {new Date(inv.signedAt || inv.issuedAt).toLocaleString('vi-VN')}</div>
          </div>
        </div>
      </div>
      <div className="einvoice-foot">
        {draft ? <span>Bản nháp để kiểm tra - chưa có giá trị, chưa gửi cho khách</span> : <>Tra cứu hóa đơn tại <b>{window.location.origin}/tra-cuu-hoa-don</b> · Mã tra cứu: <b>{inv.lookupCode}</b></>}
        {void_ && inv.cancelReason && <div className="text-danger">Lý do {inv.status === 'replaced' ? 'thay thế' : 'hủy'}: {inv.cancelReason}</div>}
        <div><Badge bg="warning" text="dark">Hóa đơn điện tử GIẢ LẬP phục vụ kiểm thử - không có giá trị kê khai thuế</Badge></div>
      </div>
    </div>
  );
}
