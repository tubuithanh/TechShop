import { Container } from 'react-bootstrap';

export default function PrivacyPage() {
  return (
    <Container fluid="xl" style={{ maxWidth: '48rem' }} className="py-5 small">
      <h1 className="fs-3 fw-bold mb-4">Chính sách bảo mật</h1>
      <p className="mb-3">
        TechShop cam kết bảo vệ thông tin cá nhân của khách hàng. Dữ liệu thu thập (họ tên, số điện thoại, email, địa
        chỉ) chỉ được sử dụng cho mục đích xử lý đơn hàng, chăm sóc khách hàng và không chia sẻ cho bên thứ ba khi
        chưa có sự đồng ý, trừ trường hợp pháp luật yêu cầu.
      </p>
      <p className="mb-3">
        Khách hàng có quyền yêu cầu chỉnh sửa hoặc xóa dữ liệu cá nhân của mình bằng cách liên hệ bộ phận hỗ trợ.
      </p>
    </Container>
  );
}
