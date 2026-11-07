import { Link } from 'react-router-dom';
import { Container, Row, Col } from 'react-bootstrap';
import { Facebook, Youtube, Instagram, Chat } from 'react-bootstrap-icons';
import { useSettings } from '../store/SettingsContext';
import { normalizeFooter, fillFooterText, isInternalLink } from '../utils/footer';

// Danh sách liên kết trong footer (chữ sáng, gạch chân khi rê chuột). Link trong website dùng <Link>,
// link ngoài (https://, mailto:, tel:) mở bằng thẻ <a> - link http(s) mở tab mới.
function FooterLinks({ links }) {
  return (
    <ul className="list-unstyled mb-0 d-flex flex-column gap-1">
      {links.map(({ url, label }, i) => (
        <li key={`${url}-${i}`}>
          {isInternalLink(url) ? (
            <Link to={url} className="footer-link">
              {label}
            </Link>
          ) : (
            <a href={url} className="footer-link" {...(/^https?:/i.test(url) ? { target: '_blank', rel: 'noreferrer' } : {})}>
              {label}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function Footer() {
  const { settings } = useSettings();
  const social = settings.socialLinks || {};
  // Nội dung sửa ở Admin -> Cấu hình hệ thống -> Chân trang
  const footer = normalizeFooter(settings.footer);

  return (
    <footer className="bg-dark text-light mt-auto site-footer">
      <Container fluid="xl" className="py-4">
        <Row className="gy-4 small">
          <Col xs={12} md={3}>
            <h6 className="text-white fw-semibold mb-2">{settings.siteName}</h6>
            <p className="mb-1">{settings.tagline}</p>
            {footer.aboutText && <p className="mb-0">{footer.aboutText}</p>}
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
          {footer.columns.map((col, ci) => (
            <Col xs={12} md={3} key={ci}>
              <h6 className="text-white fw-semibold mb-2">{col.title}</h6>
              <FooterLinks links={col.links || []} />
            </Col>
          ))}
          <Col xs={12} md={3}>
            <h6 className="text-white fw-semibold mb-2">{footer.contactTitle}</h6>
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
      {footer.copyright && (
        <div className="text-center small py-3 border-top border-secondary">{fillFooterText(footer.copyright, settings.siteName)}</div>
      )}
    </footer>
  );
}
