import { useEffect, useRef, useState } from 'react';
import { Form, InputGroup, Button, Badge } from 'react-bootstrap';
import { Search, XLg } from 'react-bootstrap-icons';

// Thanh tìm kiếm dùng chung cho các trang quản trị:
// - tự tìm sau khi ngừng gõ 0,3 giây (không cần Enter), nút ✕ xóa nhanh, phím "/" để nhảy vào ô tìm kiếm
// - bộ lọc dạng ô chọn / ngày; bộ lọc đang áp dụng hiện thành "chip", bấm × để bỏ
// - dòng "Tìm thấy N kết quả" và nút "Xóa bộ lọc"
// filters: [{ key, label, type: 'select' | 'date', options: [{ value, label }] }]
export default function AdminSearchBar({ query, placeholder, filters = [], total, loading }) {
  const { values, update, reset } = query;
  const [text, setText] = useState(values.q);
  const inputRef = useRef(null);

  // Đồng bộ khi URL đổi từ bên ngoài (Back/Forward, nút Xóa bộ lọc)
  // (so sánh sau khi bỏ khoảng trắng 2 đầu - không xóa mất dấu cách khách vừa gõ giữa chừng)
  useEffect(() => {
    setText((current) => (current.trim() === values.q ? current : values.q));
  }, [values.q]);

  // Chờ ngừng gõ rồi mới tìm, tránh gọi API ở mỗi phím
  useEffect(() => {
    if (text.trim() === values.q) return undefined;
    const timer = setTimeout(() => update({ q: text.trim() }), 300);
    return () => clearTimeout(timer);
  }, [text, values.q, update]);

  // Phím tắt "/" để đưa con trỏ vào ô tìm kiếm (trừ khi đang gõ trong ô nhập khác)
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !document.activeElement?.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const activeFilters = filters.filter((f) => values[f.key]);
  const hasAny = values.q || activeFilters.length > 0;
  const chipLabel = (f) => {
    if (f.type === 'date') return `${f.label}: ${new Date(values[f.key]).toLocaleDateString('vi-VN')}`;
    return `${f.label}: ${f.options.find((o) => String(o.value) === values[f.key])?.label || values[f.key]}`;
  };

  return (
    <div className="bg-white rounded-3 shadow-sm p-3 mb-3">
      <div className="d-flex flex-wrap gap-2 align-items-center">
        <InputGroup style={{ flex: '1 1 18rem', maxWidth: '28rem' }}>
          <InputGroup.Text className="bg-white">
            <Search size={14} />
          </InputGroup.Text>
          <Form.Control
            ref={inputRef}
            type="search"
            value={text}
            placeholder={placeholder}
            aria-label="Tìm kiếm"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') update({ q: text.trim() }); // Enter: tìm ngay, không chờ
              if (e.key === 'Escape') setText('');
            }}
          />
          {text && (
            <Button variant="outline-secondary" aria-label="Xóa từ khóa" onClick={() => setText('')}>
              <XLg size={12} />
            </Button>
          )}
        </InputGroup>

        {filters.map((f) =>
          f.type === 'date' ? (
            <InputGroup key={f.key} size="sm" style={{ width: 'auto' }}>
              <InputGroup.Text>{f.label}</InputGroup.Text>
              <Form.Control
                type="date"
                aria-label={f.label}
                value={values[f.key]}
                onChange={(e) => update({ [f.key]: e.target.value })}
                style={{ width: '9.5rem' }}
              />
            </InputGroup>
          ) : (
            <Form.Select
              key={f.key}
              size="sm"
              aria-label={f.label}
              value={values[f.key]}
              onChange={(e) => update({ [f.key]: e.target.value })}
              style={{ width: 'auto', minWidth: '9rem' }}
            >
              <option value="">{f.label}: Tất cả</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Form.Select>
          )
        )}
      </div>

      {(hasAny || total !== undefined) && (
        <div className="d-flex flex-wrap gap-2 align-items-center mt-2 small">
          <span className="text-muted" aria-live="polite">
            {loading ? 'Đang tìm...' : hasAny ? `Tìm thấy ${Number(total || 0).toLocaleString('vi-VN')} kết quả` : `Tổng ${Number(total || 0).toLocaleString('vi-VN')}`}
          </span>
          {activeFilters.map((f) => (
            <Badge key={f.key} bg="light" text="dark" className="border fw-normal d-inline-flex align-items-center gap-1">
              {chipLabel(f)}
              <button type="button" className="btn btn-link p-0 lh-1 text-muted" aria-label={`Bỏ lọc ${f.label}`} onClick={() => update({ [f.key]: '' })}>
                ×
              </button>
            </Badge>
          ))}
          {hasAny && (
            <Button variant="link" size="sm" className="p-0" onClick={reset}>
              Xóa bộ lọc
            </Button>
          )}
          <span className="text-muted ms-auto d-none d-md-inline">
            Nhấn <kbd>/</kbd> để tìm nhanh · gõ không dấu cũng được
          </span>
        </div>
      )}
    </div>
  );
}
