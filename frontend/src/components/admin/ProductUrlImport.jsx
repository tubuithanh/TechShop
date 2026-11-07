import { useState } from 'react';
import { Alert, Button, Form, InputGroup, Spinner } from 'react-bootstrap';
import { CloudDownload, ClipboardCheck } from 'react-bootstrap-icons';
import api from '../../services/api';

// Ô "Nhập nhanh từ link" (sản phẩm từ thegioididong.com, tin tức từ tinhte.vn...): gọi backend đọc thông tin + tải ảnh về kho ảnh,
// rồi đưa bản nháp cho form (onImported). Không tự lưu - admin xem lại, sửa rồi mới bấm Lưu.
// Dự phòng: nếu máy chủ bị trang nguồn chặn, admin dán mã nguồn trang copy từ trình duyệt của mình.
export default function ProductUrlImport({
  onImported,
  sourceName = 'thegioididong.com',
  endpoint = '/products/import-url',
  htmlEndpoint = '/products/import-html',
  placeholder = 'VD: https://www.thegioididong.com/dtdd/iphone-16-pro-max',
  hint = 'Tự điền tên, thương hiệu, danh mục, màu/giá, thông số và tải ảnh về kho ảnh của website. Hãy kiểm tra lại trước khi lưu. Dữ liệu thuộc bản quyền của trang nguồn - chỉ dùng cho mục đích minh họa.'
}) {
  const [url, setUrl] = useState('');
  const [html, setHtml] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { variant, message, warnings }

  const run = async (mode) => {
    setLoading(true);
    setResult(null);
    try {
      const { data } =
        mode === 'html'
          ? await api.post(htmlEndpoint, { url, html })
          : await api.post(endpoint, { url });
      onImported(data.data);
      setResult({ variant: data.warnings?.length ? 'warning' : 'success', message: data.message, warnings: data.warnings || [] });
      if (mode === 'html') {
        setHtml('');
        setShowPaste(false);
      }
    } catch (err) {
      setResult({ variant: 'danger', message: err.response?.data?.message || 'Không lấy được thông tin', warnings: [] });
      if (err.response?.data?.blocked) setShowPaste(true); // máy chủ bị chặn -> mở sẵn cách dán mã nguồn
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded-3 p-3 bg-light">
      <Form.Label className="small fw-medium mb-1" htmlFor="import-url">
        Nhập nhanh từ link {sourceName}
      </Form.Label>
      <InputGroup size="sm">
        <Form.Control
          id="import-url"
          placeholder={placeholder}
          value={url}
          disabled={loading}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault(); // không gửi form sản phẩm
              if (url.trim() && !loading) run('url');
            }
          }}
        />
        <Button variant="primary" disabled={!url.trim() || loading} onClick={() => run('url')}>
          {loading ? <Spinner size="sm" className="me-1" /> : <CloudDownload className="me-1" />}
          {loading ? 'Đang lấy thông tin và tải ảnh...' : 'Lấy thông tin'}
        </Button>
      </InputGroup>
      <Form.Text className="text-muted">
        {hint}{' '}
        <Button variant="link" size="sm" className="p-0 align-baseline" onClick={() => setShowPaste((v) => !v)}>
          {showPaste ? 'Ẩn cách dán mã nguồn' : 'Không lấy được? Dán mã nguồn trang'}
        </Button>
      </Form.Text>

      {showPaste && (
        <div className="mt-2 border rounded-3 p-2 bg-white">
          <div className="small mb-2">
            <strong>Dán mã nguồn trang</strong> - dùng khi máy chủ bị {sourceName} chặn:
            <ol className="mb-1 ps-3">
              <li>Dán link vào ô phía trên.</li>
              <li>
                Mở trang đó trên trình duyệt, nhấn <kbd>Ctrl</kbd> + <kbd>U</kbd> để xem mã nguồn trang.
              </li>
              <li>
                Nhấn <kbd>Ctrl</kbd> + <kbd>A</kbd> rồi <kbd>Ctrl</kbd> + <kbd>C</kbd> để copy toàn bộ, dán vào ô dưới đây.
              </li>
            </ol>
          </div>
          <Form.Control
            as="textarea"
            id="import-html"
            rows={4}
            className="font-monospace small"
            placeholder="<!DOCTYPE html> ... (dán toàn bộ mã nguồn trang)"
            value={html}
            disabled={loading}
            onChange={(e) => setHtml(e.target.value)}
          />
          <div className="d-flex justify-content-between align-items-center mt-2">
            <span className="small text-muted">{html ? `${Math.round(html.length / 1024)} KB` : ''}</span>
            <Button size="sm" variant="primary" disabled={!url.trim() || html.length < 500 || loading} onClick={() => run('html')}>
              <ClipboardCheck className="me-1" />
              {loading ? 'Đang đọc và tải ảnh...' : 'Đọc từ mã nguồn'}
            </Button>
          </div>
        </div>
      )}

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
