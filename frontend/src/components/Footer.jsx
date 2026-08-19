import { Container, Row, Col } from 'react-bootstrap';
import { Facebook, Youtube, Instagram, Chat } from 'react-bootstrap-icons';
import { useSettings } from '../store/SettingsContext';

export default function Footer() {
  const { settings } = useSettings();
  const social = settings.socialLinks || {};

  return (
    <footer className="bg-dark text-light mt-auto">
      <Container fluid="xl" className="py-4">
        <Row className="gy-4 small">
          <Col xs={12} md={3}>
            <h6 className="text-white fw-semibold mb-2">{settings.siteName}</h6>
            <p className="mb-1">{settings.tagline}</p>
            <p className="mb-0">Công nghệ: MERN Stack (MongoDB - Express - React - Node.js)</p>
            {(social.facebook || social.youtube || social.instagram || social.zalo) && (
              <div className="d-flex gap-2 mt-2">
                {social.facebook && (
                  <a href={social.facebook} target="_blank" rel="noreferrer" className="text-light">
                    <Facebook size={18} />
                  </a>
                )}
                {social.youtube && (
                  <a href={social.youtube} target="_blank" rel="noreferrer" className="text-light">
                    <Youtube size={18} />
                  </a>
                )}
                {social.instagram && (
                  <a href={social.instagram} target="_blank" rel="noreferrer" className="text-light">
                    <Instagram size={18} />
                  </a>
                )}
                {social.zalo && (
                  <a href={social.zalo} target="_blank" rel="noreferrer" className="text-light">
                    <Chat size={18} />
                  </a>
                )}
              </div>
            )}
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
            <p className="mb-0">Hotline: {settings.hotline}</p>
            <p className="mb-0">Email: {settings.contactEmail}</p>
            {settings.contactAddress && <p className="mb-0">Địa chỉ: {settings.contactAddress}</p>}
          </Col>
        </Row>
      </Container>
      <div className="text-center small py-3 border-top border-secondary">
        © 2026 {settings.siteName} - Đồ án tốt nghiệp. Dữ liệu và giao dịch chỉ mang tính minh họa.
      </div>
    </footer>
  );
}
