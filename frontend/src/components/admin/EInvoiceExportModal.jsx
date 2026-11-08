import { useState } from 'react';
import { Alert, Button, Form, Modal, ProgressBar } from 'react-bootstrap';
import { FileEarmarkSpreadsheet } from 'react-bootstrap-icons';
import { orderService } from '../../services/orderService';
import { exportEInvoiceFile, fetchAllOrders } from '../../utils/einvoiceExport';

// Hộp thoại xuất đơn hàng ra Excel để import lên hệ thống hóa đơn điện tử.
// Lấy đúng các đơn đang khớp bộ lọc / tìm kiếm của trang Quản lý đơn hàng (apiParams), thêm 2 tùy chọn lọc.
export default function EInvoiceExportModal({ apiParams, shippingVatRate, onHide }) {
  // Bật sẵn khi chưa lọc trạng thái (hoặc đang lọc đúng "đã giao"); đang lọc trạng thái khác thì tôn trọng bộ lọc đó
  const [onlyDelivered, setOnlyDelivered] = useState(!apiParams.status || apiParams.status === 'delivered');
  const [onlyCompany, setOnlyCompany] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleExport = async () => {
    setError('');
    setResult(null);
    setProgress({ done: 0, total: 0 });
    try {
      const params = { ...apiParams };
      delete params.page;
      // Hóa đơn chỉ xuất cho đơn đã hoàn tất (đã giao / đã nhận tại cửa hàng)
      if (onlyDelivered) params.status = 'delivered';
      const { orders, total } = await fetchAllOrders(orderService.getAllOrdersAdmin, params, {
        onProgress: (done, t) => setProgress({ done, total: t })
      });
      const picked = onlyCompany ? orders.filter((o) => o.invoiceInfo?.taxCode) : orders;
      if (picked.length === 0) {
        setError('Không có đơn hàng nào phù hợp để xuất hóa đơn');
        return;
      }
      const r = exportEInvoiceFile(picked, { shippingVatRate });
      setResult({ ...r, truncated: total > orders.length });
    } catch (err) {
      setError(err.response?.data?.message || 'Không tải được danh sách đơn hàng');
    } finally {
      setProgress(null);
    }
  };

  const activeFilters = Object.keys(apiParams).filter((k) => k !== 'page').length;

  return (
    <Modal show onHide={progress ? undefined : onHide} centered>
      <Modal.Header closeButton={!progress}>
        <Modal.Title className="fs-6 fw-bold d-flex align-items-center gap-2">
          <FileEarmarkSpreadsheet className="text-success" /> Xuất file hóa đơn điện tử
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="small text-muted">
          Tạo file Excel (.xlsx) theo mẫu chung để <b>nhập khẩu</b> lên cổng hóa đơn điện tử (MISA meInvoice, Viettel S-Invoice,
          VNPT, BKAV…). Giá đã được tách sẵn phần chưa thuế và tiền thuế GTGT theo từng dòng hàng.
        </p>
        <div className="small mb-3">
          Phạm vi: các đơn đang hiển thị theo {activeFilters ? <b>{activeFilters} bộ lọc / từ khóa hiện tại</b> : <b>tất cả đơn hàng</b>}.
          Có thể lọc theo ngày, chi nhánh… ở trang danh sách trước khi xuất.
        </div>
        <Form.Check
          type="switch"
          id="einv-delivered"
          className="mb-2"
          checked={onlyDelivered}
          onChange={(e) => setOnlyDelivered(e.target.checked)}
          label="Chỉ đơn đã hoàn tất (đã giao / đã nhận hàng)"
        />
        {onlyDelivered && apiParams.status && apiParams.status !== 'delivered' && (
          <div className="small text-warning-emphasis ms-5 mb-2">Tùy chọn này thay cho bộ lọc trạng thái đang chọn ở trang danh sách.</div>
        )}
        <Form.Check
          type="switch"
          id="einv-company"
          checked={onlyCompany}
          onChange={(e) => setOnlyCompany(e.target.checked)}
          label="Chỉ đơn khách yêu cầu hóa đơn công ty (có mã số thuế)"
        />

        {progress && (
          <div className="mt-3">
            <div className="small text-muted mb-1">
              Đang tải đơn hàng… {progress.done}
              {progress.total ? ` / ${progress.total}` : ''}
            </div>
            <ProgressBar animated now={progress.total ? (progress.done / progress.total) * 100 : 10} />
          </div>
        )}
        {error && (
          <Alert variant="warning" className="small mt-3 mb-0">
            {error}
          </Alert>
        )}
        {result && (
          <Alert variant="success" className="small mt-3 mb-0">
            Đã tạo file gồm <b>{result.orders}</b> hóa đơn ({result.rows} dòng hàng). Mở cổng hóa đơn điện tử → Nhập khẩu từ Excel →
            ghép cột theo tiêu đề → Phát hành.
            {result.truncated && <div className="mt-1">Chỉ xuất 5.000 đơn đầu tiên - hãy lọc theo khoảng ngày để xuất phần còn lại.</div>}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide} disabled={Boolean(progress)}>
          Đóng
        </Button>
        <Button variant="success" onClick={handleExport} disabled={Boolean(progress)} className="d-flex align-items-center gap-2">
          <FileEarmarkSpreadsheet /> {progress ? 'Đang xuất…' : 'Tải file Excel'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
