import { useEffect, useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { ExclamationTriangleFill } from 'react-bootstrap-icons';
import api from '../../services/api';

// Hộp thoại xóa vĩnh viễn sản phẩm (chỉ admin).
// B1: hỏi backend sản phẩm đã có đơn hàng / bảo hành / đánh giá chưa.
//     - Đã có -> không cho xóa, gợi ý dùng "Ẩn".
//     - Chưa có -> bắt gõ lại đúng tên sản phẩm mới bật nút xóa.
export default function DeleteProductModal({ product, onHide, onDeleted, onHideProduct }) {
  const [check, setCheck] = useState(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get(`/products/${product._id}/delete-check`)
      .then(({ data }) => setCheck(data.data))
      .catch((err) => setError(err.response?.data?.message || 'Không kiểm tra được sản phẩm'));
  }, [product._id]);

  const handleDelete = async () => {
    setBusy(true);
    setError('');
    try {
      await api.delete(`/products/${product._id}/permanent`, { data: { confirm } });
      onDeleted();
    } catch (err) {
      setError(err.response?.data?.message || 'Không xóa được sản phẩm');
      setBusy(false);
    }
  };

  const matches = confirm.trim() === product.title.trim();

  return (
    <Modal show onHide={busy ? undefined : onHide} centered>
      <Modal.Header closeButton={!busy}>
        <Modal.Title className="fs-6 fw-bold d-flex align-items-center gap-2">
          <ExclamationTriangleFill className="text-danger" /> Xóa vĩnh viễn sản phẩm
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="fw-medium mb-3">{product.title}</div>

        {!check && !error && (
          <div className="text-center py-3">
            <Spinner size="sm" animation="border" /> <span className="small text-muted ms-2">Đang kiểm tra dữ liệu liên quan…</span>
          </div>
        )}

        {check && !check.deletable && (
          <Alert variant="warning" className="small mb-0">
            <div className="fw-semibold mb-1">Không thể xóa vĩnh viễn sản phẩm này</div>
            Sản phẩm đã phát sinh giao dịch:
            <ul className="mb-2 mt-1">
              {check.orders > 0 && <li>{check.orders} đơn hàng</li>}
              {check.warranties > 0 && <li>{check.warranties} phiếu bảo hành</li>}
              {check.reviews > 0 && <li>{check.reviews} đánh giá</li>}
            </ul>
            Xóa sẽ làm hỏng lịch sử đơn hàng, bảo hành và sai thống kê doanh thu. Hãy dùng <b>Ẩn</b> để ngừng bán
            (có thể khôi phục lại bất cứ lúc nào).
          </Alert>
        )}

        {check?.deletable && (
          <>
            <Alert variant="danger" className="small">
              Thao tác này <b>không thể hoàn tác</b>. Sản phẩm sẽ bị xóa khỏi hệ thống cùng với tồn kho tại mọi chi
              nhánh, câu hỏi, và bị gỡ khỏi giỏ hàng, danh sách yêu thích, bộ sưu tập, bài viết liên quan.
            </Alert>
            <Form.Label className="small">
              Gõ lại tên sản phẩm <b>{product.title}</b> để xác nhận:
            </Form.Label>
            <Form.Control
              autoFocus
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && matches && !busy && handleDelete()}
              placeholder={product.title}
              isValid={matches}
            />
          </>
        )}

        {error && (
          <Alert variant="danger" className="small mt-3 mb-0">
            {error}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide} disabled={busy}>
          Hủy
        </Button>
        {check && !check.deletable && product.isActive && (
          <Button variant="warning" onClick={onHideProduct}>
            Ẩn sản phẩm thay thế
          </Button>
        )}
        {check?.deletable && (
          <Button variant="danger" disabled={!matches || busy} onClick={handleDelete}>
            {busy ? <Spinner size="sm" animation="border" /> : 'Xóa vĩnh viễn'}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}
