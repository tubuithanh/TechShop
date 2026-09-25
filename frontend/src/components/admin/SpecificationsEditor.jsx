import { useState } from 'react';
import { Row, Col, Form, Button } from 'react-bootstrap';
import { OTHER_SPECS_GROUP } from '../../utils/specs';

// Ô nhập thông số kỹ thuật cho form sản phẩm: hiện sẵn các trường theo mẫu của danh mục đã chọn (chia
// nhóm, có gợi ý định dạng), kèm mục "Thông số khác" cho các trường ngoài mẫu (dữ liệu cũ, hoặc danh
// mục chưa có mẫu). `value` là object { tên thông số: giá trị }.
export default function SpecificationsEditor({ template, value, onChange }) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const specs = value || {};
  const templateKeys = new Set((template || []).flatMap((g) => g.fields.map((f) => f.key)));
  const extraKeys = Object.keys(specs).filter((k) => !templateKeys.has(k));

  const setField = (key, fieldValue) => onChange({ ...specs, [key]: fieldValue });

  const removeField = (key) => {
    const next = { ...specs };
    delete next[key];
    onChange(next);
  };

  const addCustomField = () => {
    const key = newKey.trim();
    if (!key || !newValue.trim()) return;
    // Mongoose Map không chấp nhận khóa chứa dấu "." - chặn ngay ở đây thay vì để backend báo lỗi.
    if (key.includes('.')) {
      alert('Tên thông số không được chứa dấu chấm (.)');
      return;
    }
    if (key in specs || templateKeys.has(key)) {
      alert('Thông số này đã có trong danh sách');
      return;
    }
    onChange({ ...specs, [key]: newValue.trim() });
    setNewKey('');
    setNewValue('');
  };

  return (
    <div className="border rounded-3 p-3">
      <div className="small fw-medium mb-2">Thông số kỹ thuật</div>
      {(!template || template.length === 0) && (
        <div className="small text-muted mb-2">
          Danh mục này chưa có mẫu thông số - nhập thông số tự do ở mục "{OTHER_SPECS_GROUP}" bên dưới.
        </div>
      )}

      {(template || []).map((g) => (
        <div key={g.group} className="mb-3">
          <div className="small text-uppercase text-muted fw-bold mb-2" style={{ letterSpacing: '0.03em' }}>
            {g.group}
          </div>
          <Row className="g-2">
            {g.fields.map((f) => (
              <Col md={6} key={f.key}>
                <Form.Group>
                  <Form.Label className="small mb-1">{f.key}</Form.Label>
                  <Form.Control
                    size="sm"
                    placeholder={f.hint ? `VD: ${f.hint}` : ''}
                    value={specs[f.key] || ''}
                    onChange={(e) => setField(f.key, e.target.value)}
                  />
                </Form.Group>
              </Col>
            ))}
          </Row>
        </div>
      ))}

      <div className="small text-uppercase text-muted fw-bold mb-2" style={{ letterSpacing: '0.03em' }}>
        {OTHER_SPECS_GROUP}
      </div>
      {extraKeys.map((key) => (
        <div key={key} className="d-flex align-items-center gap-2 mb-2">
          <span className="small" style={{ minWidth: 160 }}>
            {key}
          </span>
          <Form.Control size="sm" value={specs[key] || ''} onChange={(e) => setField(key, e.target.value)} />
          <Button variant="outline-danger" size="sm" onClick={() => removeField(key)}>
            ✕
          </Button>
        </div>
      ))}
      <div className="d-flex align-items-center gap-2">
        <Form.Control size="sm" placeholder="Tên thông số" value={newKey} onChange={(e) => setNewKey(e.target.value)} style={{ maxWidth: 200 }} />
        <Form.Control size="sm" placeholder="Giá trị" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
        <Button variant="outline-primary" size="sm" className="text-nowrap" onClick={addCustomField}>
          + Thêm
        </Button>
      </div>
    </div>
  );
}
