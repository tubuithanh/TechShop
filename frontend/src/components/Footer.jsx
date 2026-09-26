import { Link } from 'react-router-dom';
import { Container, Row, Col } from 'react-bootstrap';
import { Facebook, Youtube, Instagram, Chat } from 'react-bootstrap-icons';
import { useSettings } from '../store/SettingsContext';

// Danh sách liên kết trong footer (chữ sáng, gạch chân khi rê chuột)
function FooterLinks({ links }) {
  return (
    <ul className="list-unstyled mb-0 d-flex flex-column gap-1">
      {links.map(([to, label]) => (
        <li key={to}>
          <Link to={to} className="footer-link">
            {label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

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
            <FooterLinks
              links={[
                ['/huong-dan-mua-hang', 'Hướng dẫn mua hàng'],
                ['/tra-cuu-bao-hanh', 'Tra cứu bảo hành'],
                ['/stores', 'Hệ thống cửa hàng'],
                ['/promotions', 'Chương trình khuyến mãi'],
                ['/account/orders', 'Tra cứu đơn hàng']
              ]}
            />
          </Col>
          <Col xs={12} md={3}>
            <h6 className="text-white fw-semibold mb-2">Chính sách</h6>
            <FooterLinks
              links={[
                ['/chinh-sach-doi-tra', 'Chính sách đổi trả'],
                ['/chinh-sach-bao-hanh', 'Chính sách bảo hành'],
                ['/chinh-sach-giao-hang', 'Chính sách giao hàng'],
                ['/chinh-sach-thanh-toan', 'Chính sách thanh toán'],
                ['/privacy', 'Chính sách bảo mật'],
                ['/terms', 'Điều khoản sử dụng']
              ]}
            />
          </Col>
          <Col xs={12} md={3}>
            <h6 className="text-white fw-semibold mb-2">Liên hệ</h6>
            <p className="mb-1">
              Hotline:{' '}
              <a href={`tel:${String(settings.hotline).replace(/\s/g, '')}`} className="footer-link fw-semibold">
                {settings.hotline}
              </a>
            </p>
            <p className="mb-1">
              Email:{' '}
              <a href={`mailto:${settings.contactEmail}`} className="footer-link">
                {settings.contactEmail}
              </a>
            </p>
            {settings.contactAddress && <p className="mb-0">Địa chỉ: {settings.contactAddress}</p>}
          </Col>
        </Row>
      </Container>
      <div className="text-center small py-3 border-top border-secondary">
        © 2026 {settings.siteName} - Tiểu luận chuyên ngành. Dữ liệu và giao dịch chỉ mang tính minh họa.
      </div>
    </footer>
  );
}
