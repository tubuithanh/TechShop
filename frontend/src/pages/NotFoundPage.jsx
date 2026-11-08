import { Link } from 'react-router-dom';
import { Container, Button } from 'react-bootstrap';
import { Compass } from 'react-bootstrap-icons';

// Trang 404 cho mọi đường dẫn không tồn tại (trước đây hiện trang trắng trơn)
export default function NotFoundPage() {
  return (
    <Container className="py-5">
      <div className="empty-state py-5">
        <Compass size={48} />
        <div className="display-6 fw-bold mt-3">404</div>
        <div className="fw-semibold mb-1">Không tìm thấy trang bạn yêu cầu</div>
        <div className="small text-muted mb-4">Trang có thể đã bị xóa, đổi địa chỉ hoặc đường dẫn không đúng.</div>
        <div className="d-flex justify-content-center gap-2 flex-wrap">
          <Button as={Link} to="/">
            Về trang chủ
          </Button>
          <Button as={Link} to="/products" variant="outline-primary">
            Xem sản phẩm
          </Button>
        </div>
      </div>
    </Container>
  );
}
