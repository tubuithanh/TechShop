import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, Row, Col, Breadcrumb, Button, Card } from 'react-bootstrap';
import { useSettings } from '../store/SettingsContext';

// Khung dùng chung cho các trang chính sách (Điều khoản sử dụng, Chính sách bảo mật...): phần đầu có ngày
// hiệu lực, mục lục bám theo vị trí đang đọc, các mục được đánh số, hộp liên hệ và liên kết chính sách liên quan.
// sections: [{ id, title, content }] - content là JSX.
export default function LegalPage({ title, subtitle, effectiveDate, updatedDate, sections, related }) {
  const { settings } = useSettings();
  const [activeId, setActiveId] = useState(sections[0]?.id);

  useEffect(() => {
    document.title = `${title} | ${settings.siteName || 'TechShop'}`;
  }, [title, settings.siteName]);

  // Tô sáng mục đang đọc trong mục lục
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-90px 0px -65% 0px' }
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  const scrollTo = (e, id) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.replaceState(null, '', `#${id}`);
  };

  const toc = (
    <nav aria-label="Mục lục">
      <div className="text-uppercase text-muted fw-semibold mb-2" style={{ fontSize: '0.7rem', letterSpacing: '0.06em' }}>
        Mục lục
      </div>
      <ol className="list-unstyled mb-0 d-flex flex-column gap-1">
        {sections.map((s, i) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              onClick={(e) => scrollTo(e, s.id)}
              className={`d-block text-decoration-none rounded px-2 py-1 small ${
                activeId === s.id ? 'bg-primary-subtle text-primary fw-semibold' : 'text-body'
              }`}
            >
              {i + 1}. {s.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );

  return (
    <div className="bg-body-tertiary pb-5">
      <div className="bg-white border-bottom">
        <Container fluid="xl" className="py-4">
          <Breadcrumb style={{ fontSize: '0.75rem' }} className="mb-2">
            <Breadcrumb.Item linkAs={Link} linkProps={{ to: '/' }}>
              Trang chủ
            </Breadcrumb.Item>
            <Breadcrumb.Item active>{title}</Breadcrumb.Item>
          </Breadcrumb>
          <div className="d-flex flex-wrap justify-content-between align-items-end gap-3">
            <div>
              <h1 className="fs-3 fw-bold mb-1">{title}</h1>
              {subtitle && <p className="text-muted mb-2">{subtitle}</p>}
              <div className="small text-muted d-flex flex-wrap gap-3">
                <span>
                  Có hiệu lực từ: <strong className="text-body">{effectiveDate}</strong>
                </span>
                <span>
                  Cập nhật lần cuối: <strong className="text-body">{updatedDate}</strong>
                </span>
              </div>
            </div>
            <Button variant="outline-secondary" size="sm" className="d-print-none" onClick={() => window.print()}>
              🖨 In / Lưu PDF
            </Button>
          </div>
        </Container>
      </div>

      <Container fluid="xl" className="pt-4">
        <Row className="g-4">
          <Col lg={3} className="d-print-none">
            {/* Máy tính: mục lục bám theo khi cuộn; điện thoại: thu gọn */}
            <div className="d-none d-lg-block position-sticky" style={{ top: '6rem' }}>
              <Card body className="border-0 shadow-sm">
                {toc}
              </Card>
            </div>
            <details className="d-lg-none bg-white rounded shadow-sm p-3">
              <summary className="fw-semibold small">Mục lục ({sections.length} mục)</summary>
              <div className="mt-2">{toc}</div>
            </details>
          </Col>

          <Col lg={9}>
            <Card className="border-0 shadow-sm">
              <Card.Body className="p-4 p-md-5 legal-content" style={{ lineHeight: 1.75 }}>
                {sections.map((s, i) => (
                  <section key={s.id} id={s.id} className="mb-5" style={{ scrollMarginTop: '6rem' }}>
                    <h2 className="fs-5 fw-bold mb-3 d-flex gap-2">
                      <span className="text-primary">{i + 1}.</span>
                      <span>{s.title}</span>
                    </h2>
                    <div className="text-body-secondary">{s.content}</div>
                  </section>
                ))}

                <div className="border rounded-3 p-4 bg-body-tertiary">
                  <div className="fw-semibold mb-2">Cần hỗ trợ thêm?</div>
                  <p className="small mb-2">
                    Mọi thắc mắc về {title.toLowerCase()}, vui lòng liên hệ bộ phận Chăm sóc khách hàng của{' '}
                    {settings.siteName || 'TechShop'}:
                  </p>
                  <ul className="small mb-0">
                    <li>
                      Tổng đài: <strong>{settings.hotline}</strong> (8:00 – 21:30, tất cả các ngày trong tuần)
                    </li>
                    <li>
                      Email: <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a>
                    </li>
                    <li>
                      Trực tiếp tại <Link to="/stores">hệ thống cửa hàng</Link> hoặc chat với nhân viên tư vấn ở góc phải màn hình
                    </li>
                  </ul>
                </div>

                {related && (
                  <p className="small text-muted mt-4 mb-0">
                    Xem thêm: <Link to={related.to}>{related.label}</Link>
                  </p>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
}
