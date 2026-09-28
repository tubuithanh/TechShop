import { useState } from 'react';
import { Alert, Button, Form, InputGroup, Spinner } from 'react-bootstrap';
import { CloudDownload } from 'react-bootstrap-icons';
import api from '../../services/api';

// Ô "Nhập từ link thegioididong.com" ở form Thêm sản phẩm: gọi backend đọc thông tin + tải ảnh về kho ảnh,
// rồi đưa bản nháp cho form (onImported). Không tự lưu sản phẩm - admin xem lại, sửa rồi mới bấm Lưu.
export default function ProductUrlImport({ onImported }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { variant, message, warnings }

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.post('/products/import-url', { url });
      onImported(data.data);
      setResult({ variant: data.warnings?.length ? 'warning' : 'success', message: data.message, warnings: data.warnings || [] });
    } catch (err) {
      setResult({ variant: 'danger', message: err.response?.data?.message || 'Không lấy được thông tin sản phẩm', warnings: [] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded-3 p-3 bg-light">
      <Form.Label className="small fw-medium mb-1" htmlFor="import-url">
        Nhập nhanh từ link thegioididong.com
      </Form.Label>
      <InputGroup size="sm">
        <Form.Control
          id="import-url"
          placeholder="VD: https://www.thegioididong.com/dtdd/iphone-16-pro-max"
          value={url}
          disabled={loading}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault(); // không gửi form sản phẩm
              if (url.trim() && !loading) run();
            }
          }}
        />
        <Button variant="primary" disabled={!url.trim() || loading} onClick={run}>
          {loading ? <Spinner size="sm" className="me-1" /> : <CloudDownload className="me-1" />}
          {loading ? 'Đang lấy thông tin và tải ảnh...' : 'Lấy thông tin'}
        </Button>
      </InputGroup>
      <Form.Text className="text-muted">
        Tự điền tên, thương hiệu, danh mục, màu/giá, thông số và tải ảnh về kho ảnh của website. Hãy kiểm tra lại trước khi
        lưu. Dữ liệu thuộc bản quyền của trang nguồn - chỉ dùng cho mục đích minh họa.
      </Form.Text>
      {result && (
        <Alert variant={result.variant} className="small py-2 mt-2 mb-0" dismissible onClose={() => setResult(null)}>
          {result.message}
          {result.warnings.length > 0 && (
            <ul className="mb-0 mt-1 ps-3">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
    </div>
  );
}
