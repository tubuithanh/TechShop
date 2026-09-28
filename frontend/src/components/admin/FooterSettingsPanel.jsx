import { Row, Col, Form, Button, Card, InputGroup } from 'react-bootstrap';
import { LayoutTextWindowReverse, Plus, Trash, ArrowUp, ArrowDown, ArrowCounterclockwise } from 'react-bootstrap-icons';
import { DEFAULT_FOOTER, MAX_FOOTER_LINKS, normalizeFooter, fillFooterText } from '../../utils/footer';

// Tab "Chân trang (Footer)" trong Cấu hình hệ thống - nằm trong form chung (lưu bằng nút "Lưu cấu hình").
export default function FooterSettingsPanel({ footer, siteName, onChange }) {
  const f = normalizeFooter(footer);
  const set = (patch) => onChange({ ...f, ...patch });
  const setColumn = (ci, patch) => set({ columns: f.columns.map((c, i) => (i === ci ? { ...c, ...patch } : c)) });
  const setLink = (ci, li, patch) =>
    setColumn(ci, { links: f.columns[ci].links.map((l, i) => (i === li ? { ...l, ...patch } : l)) });
  const moveLink = (ci, li, dir) => {
    const links = [...f.columns[ci].links];
    const j = li + dir;
    if (j < 0 || j >= links.length) return;
    [links[li], links[j]] = [links[j], links[li]];
    setColumn(ci, { links });
  };

  return (
    <div>
      <h2 className="fs-6 fw-bold mb-3 d-flex align-items-center gap-2 border-start border-4 border-primary ps-2">
        <LayoutTextWindowReverse className="text-primary" /> Chân trang (Footer)
      </h2>
      <p className="small text-muted">
        Nội dung hiển thị ở cuối mọi trang khách hàng. Tên website, slogan, hotline, email, địa chỉ và mạng xã hội sửa ở tab{' '}
        <strong>Thông tin chung</strong> / <strong>Liên hệ</strong>. Bấm <strong>Lưu cấu hình</strong> để áp dụng.
      </p>

      <Form.Group className="mb-3">
        <Form.Label className="small fw-medium" htmlFor="footer-about">
          Dòng giới thiệu (dưới tên website)
        </Form.Label>
        <Form.Control
          id="footer-about"
          as="textarea"
          rows={2}
          maxLength={300}
          value={f.aboutText}
          placeholder="Để trống nếu không muốn hiển thị"
          onChange={(e) => set({ aboutText: e.target.value })}
        />
      </Form.Group>

      <Row className="g-3 mb-3">
        {f.columns.map((col, ci) => (
          <Col lg={6} key={ci}>
            <Card className="h-100">
              <Card.Body className="p-2">
                <Form.Label className="small fw-medium mb-1" htmlFor={`footer-col-${ci}`}>
                  Tiêu đề cột {ci + 1}
                </Form.Label>
                <Form.Control
                  id={`footer-col-${ci}`}
                  size="sm"
                  maxLength={60}
                  value={col.title}
                  onChange={(e) => setColumn(ci, { title: e.target.value })}
                  className="mb-2 fw-medium"
                />
                <div className="small text-muted mb-1">Liên kết (chữ hiển thị - đường dẫn)</div>
                {col.links.map((link, li) => (
                  <InputGroup size="sm" className="mb-1" key={li}>
                    <Form.Control
                      aria-label="Chữ hiển thị"
                      placeholder="Chữ hiển thị"
                      maxLength={80}
                      value={link.label}
                      onChange={(e) => setLink(ci, li, { label: e.target.value })}
                    />
                    <Form.Control
                      aria-label="Đường dẫn"
                      placeholder="/trang hoặc https://..."
                      maxLength={300}
                      value={link.url}
                      onChange={(e) => setLink(ci, li, { url: e.target.value.trim() })}
                      className="font-monospace"
                      style={{ fontSize: 12 }}
                    />
                    <Button variant="outline-secondary" title="Lên" disabled={li === 0} onClick={() => moveLink(ci, li, -1)}>
                      <ArrowUp />
                    </Button>
                    <Button variant="outline-secondary" title="Xuống" disabled={li === col.links.length - 1} onClick={() => moveLink(ci, li, 1)}>
                      <ArrowDown />
                    </Button>
                    <Button
                      variant="outline-danger"
                      title="Xóa liên kết"
                      onClick={() => setColumn(ci, { links: col.links.filter((_, i) => i !== li) })}
                    >
                      <Trash />
                    </Button>
                  </InputGroup>
                ))}
                <Button
                  size="sm"
                  variant="link"
                  className="px-0"
                  disabled={col.links.length >= MAX_FOOTER_LINKS}
                  onClick={() => setColumn(ci, { links: [...col.links, { label: '', url: '' }] })}
                >
                  <Plus /> Thêm liên kết
                </Button>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
      <p className="small text-muted">
        Đường dẫn trong website bắt đầu bằng <code>/</code> (VD: <code>/stores</code>, <code>/chinh-sach-doi-tra</code>); link ngoài
        bắt đầu bằng <code>https://</code> (mở tab mới). Dòng để trống cả 2 ô sẽ tự bỏ qua.
      </p>

      <Form.Group className="mb-3" style={{ maxWidth: 360 }}>
        <Form.Label className="small fw-medium" htmlFor="footer-contact-title">
          Tiêu đề cột liên hệ
        </Form.Label>
        <Form.Control id="footer-contact-title" size="sm" maxLength={60} value={f.contactTitle} onChange={(e) => set({ contactTitle: e.target.value })} />
      </Form.Group>

      <Form.Group className="mb-2">
        <Form.Label className="small fw-medium" htmlFor="footer-copyright">
          Dòng bản quyền (cuối trang)
        </Form.Label>
        <Form.Control
          id="footer-copyright"
          maxLength={300}
          value={f.copyright}
          placeholder="Để trống nếu không muốn hiển thị"
          onChange={(e) => set({ copyright: e.target.value })}
        />
        <Form.Text className="text-muted">
          <code>{'{year}'}</code> = năm hiện tại, <code>{'{siteName}'}</code> = tên website. Xem trước:{' '}
          <em>{fillFooterText(f.copyright, siteName) || '(không hiển thị)'}</em>
        </Form.Text>
      </Form.Group>

      <Button variant="link" size="sm" className="px-0" onClick={() => onChange(JSON.parse(JSON.stringify(DEFAULT_FOOTER)))}>
        <ArrowCounterclockwise className="me-1" />
        Khôi phục nội dung mặc định
      </Button>
    </div>
  );
}
