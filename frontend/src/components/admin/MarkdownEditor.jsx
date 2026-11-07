import { useRef, useState } from 'react';
import { Button, ButtonGroup, Form, Nav, Spinner } from 'react-bootstrap';
import {
  TypeBold,
  TypeItalic,
  TypeH1,
  TypeH2,
  TypeH3,
  ListUl,
  ListOl,
  Quote,
  Link45deg,
  Image as ImageIcon,
  Upload
} from 'react-bootstrap-icons';
import PostContent from '../PostContent';
import { uploadService } from '../../services/uploadService';

// Trình soạn thảo nội dung bài viết: textarea + thanh công cụ Markdown + xem trước.
// Lưu dạng văn bản (không phải HTML) -> hiển thị an toàn bằng components/PostContent.jsx.
export default function MarkdownEditor({ value, onChange, rows = 14, required }) {
  const ref = useRef(null);
  const fileRef = useRef(null);
  const [tab, setTab] = useState('write');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // Đặt lại vùng chọn sau khi React cập nhật value
  const select = (start, end) =>
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(start, end);
    });

  // Bọc phần đang chọn bằng ký hiệu (đậm, nghiêng, link)
  const wrap = (before, after, placeholder) => {
    const el = ref.current;
    const { selectionStart: s, selectionEnd: e } = el;
    const selected = value.slice(s, e) || placeholder;
    onChange(value.slice(0, s) + before + selected + after + value.slice(e));
    select(s + before.length, s + before.length + selected.length);
  };

  // Thêm tiền tố vào đầu mỗi dòng được chọn (tiêu đề, danh sách, trích dẫn)
  const prefixLines = (makePrefix) => {
    const el = ref.current;
    const s = value.lastIndexOf('\n', el.selectionStart - 1) + 1;
    let e = value.indexOf('\n', Math.max(el.selectionEnd, el.selectionStart));
    if (e === -1) e = value.length;
    const lines = value.slice(s, e).split('\n');
    const next = lines
      .map((l, i) => makePrefix(i) + l.replace(/^(#{1,3}\s+|[-*]\s+|\d+[.)]\s+|>\s?)/, ''))
      .join('\n');
    onChange(value.slice(0, s) + next + value.slice(e));
    select(s, s + next.length);
  };

  // Chèn một khối trên dòng riêng tại vị trí con trỏ (ảnh)
  const insertBlock = (text) => {
    const el = ref.current;
    const pos = el ? el.selectionEnd : value.length;
    const before = value.slice(0, pos);
    const lead = before && !before.endsWith('\n') ? '\n' : '';
    const insert = `${lead}${text}\n`;
    onChange(before + insert + value.slice(pos));
    select(pos + insert.length, pos + insert.length);
  };

  const addLink = () => {
    const url = window.prompt('Nhập đường link (https://...)', 'https://');
    if (!url || !/^https?:\/\//.test(url)) return;
    wrap('[', `](${url})`, 'chữ hiển thị');
  };

  const addImageUrl = () => {
    const url = window.prompt('Nhập link ảnh (https://...)', 'https://');
    if (!url || !/^https?:\/\//.test(url)) return;
    insertBlock(`![mô tả ảnh](${url})`);
  };

  const uploadImages = async (files) => {
    if (!files?.length) return;
    setError('');
    setUploading(true);
    try {
      const urls = await uploadService.uploadImages(files);
      insertBlock(urls.map((u) => `![](${u})`).join('\n'));
    } catch (err) {
      setError(err.response?.data?.message || 'Tải ảnh thất bại');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const tools = [
    [
      { icon: TypeBold, title: 'In đậm', run: () => wrap('**', '**', 'chữ đậm') },
      { icon: TypeItalic, title: 'In nghiêng', run: () => wrap('*', '*', 'chữ nghiêng') }
    ],
    [
      { icon: TypeH1, title: 'Tiêu đề lớn', run: () => prefixLines(() => '# ') },
      { icon: TypeH2, title: 'Tiêu đề vừa', run: () => prefixLines(() => '## ') },
      { icon: TypeH3, title: 'Tiêu đề nhỏ', run: () => prefixLines(() => '### ') }
    ],
    [
      { icon: ListUl, title: 'Danh sách', run: () => prefixLines(() => '- ') },
      { icon: ListOl, title: 'Danh sách số', run: () => prefixLines((i) => `${i + 1}. `) },
      { icon: Quote, title: 'Trích dẫn', run: () => prefixLines(() => '> ') }
    ],
    [
      { icon: Link45deg, title: 'Chèn link', run: addLink },
      { icon: ImageIcon, title: 'Chèn ảnh từ link', run: addImageUrl },
      { icon: Upload, title: 'Tải ảnh lên (tối đa 5 ảnh, mỗi ảnh ≤ 5MB)', run: () => fileRef.current?.click() }
    ]
  ];

  return (
    <div className="border rounded">
      <div className="d-flex flex-wrap align-items-center gap-2 p-2 border-bottom bg-light">
        <Nav variant="pills" activeKey={tab} onSelect={(k) => setTab(k)} className="me-2">
          <Nav.Item>
            <Nav.Link eventKey="write" className="py-1 px-2 small">Soạn thảo</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="preview" className="py-1 px-2 small">Xem trước</Nav.Link>
          </Nav.Item>
        </Nav>
        {tab === 'write' &&
          tools.map((group, gi) => (
            <ButtonGroup size="sm" key={gi}>
              {group.map(({ icon: Icon, title, run }) => (
                <Button key={title} variant="outline-secondary" title={title} aria-label={title} onClick={run} disabled={uploading}>
                  <Icon />
                </Button>
              ))}
            </ButtonGroup>
          ))}
        {uploading && <Spinner size="sm" animation="border" />}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => uploadImages(e.target.files)}
        />
      </div>
      {error && <div className="text-danger small px-2 pt-2">{error}</div>}
      {tab === 'write' ? (
        <Form.Control
          ref={ref}
          required={required}
          as="textarea"
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="border-0 rounded-0 font-monospace small"
          style={{ boxShadow: 'none' }}
        />
      ) : (
        <div className="p-3" style={{ minHeight: rows * 24 }}>
          {value.trim() ? <PostContent content={value} /> : <span className="text-muted small">Chưa có nội dung</span>}
        </div>
      )}
    </div>
  );
}
