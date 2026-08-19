import { Container, Row, Col } from 'react-bootstrap';

export default function Footer() {
  return (
    <footer className="bg-dark text-light mt-auto">
      <Container fluid="xl" className="py-4">
        <Row className="gy-4 small">
          <Col xs={12} md={3}>
            <h6 className="text-white fw-semibold mb-2">TechShop</h6>
            <p className="mb-1">Đồ án tốt nghiệp - Website TMĐT mô phỏng theo mô hình thegioididong.com</p>
            <p className="mb-0">Công nghệ: MERN Stack (MongoDB - Express - React - Node.js)</p>
          </Col>
          <Col xs={12} md={3}>
            <h6 className="text-white fw-semibold mb-2">Hỗ trợ khách hàng</h6>
            <ul className="list-unstyled mb-0">
              <li>Tra cứu bảo hành</li>
              <li>Chính sách đổi trả</li>
              <li>Hướng dẫn mua hàng</li>
            </ul>
          </Col>
          <Col xs={12} md={3}>
            <h6 className="text-white fw-semibold mb-2">Chính sách</h6>
            <ul className="list-unstyled mb-0">
              <li>Chính sách bảo mật</li>
              <li>Điều khoản sử dụng</li>
            </ul>
          </Col>
          <Col xs={12} md={3}>
            <h6 className="text-white fw-semibold mb-2">Liên hệ</h6>
            <p className="mb-0">Hotline demo: 1900 0000</p>
            <p className="mb-0">Email demo: support@techshop.demo</p>
          </Col>
        </Row>
      </Container>
      <div className="text-center small py-3 border-top border-secondary">
        © 2026 TechShop - Đồ án tốt nghiệp. Dữ liệu và giao dịch chỉ mang tính minh họa.
      </div>
    </footer>
  );
}
