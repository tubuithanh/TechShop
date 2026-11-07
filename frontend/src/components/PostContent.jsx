// Nội dung bài viết dạng Markdown rút gọn, hiển thị bằng React element (KHÔNG dùng dangerouslySetInnerHTML)
// -> nội dung nhập tay hoặc nhập từ nguồn ngoài không thể chèn mã độc. Hỗ trợ:
//   # / ## / ### Tiêu đề        - mục danh sách       1. danh sách số       > trích dẫn
//   **đậm**   *nghiêng*   [chữ](https://link)        dòng riêng ![mô tả](https://link-anh.jpg) -> ảnh
// Văn bản thường (bài cũ) vẫn hiển thị như trước: giữ nguyên xuống dòng.
const IMAGE_LINE = /^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/;
const HEADING = /^(#{1,3})\s+(.+)$/;
const BULLET = /^[-*]\s+(.+)$/;
const NUMBERED = /^\d+[.)]\s+(.+)$/;
const QUOTE = /^>\s?(.*)$/;
// Thứ tự ưu tiên: link, đậm, nghiêng
const INLINE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*/g;

function renderInline(text, keyPrefix = '') {
  const out = [];
  let last = 0;
  let m;
  let i = 0;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${i++}`;
    if (m[1] !== undefined) {
      out.push(
        <a key={key} href={m[2]} target="_blank" rel="noopener noreferrer nofollow">
          {m[1]}
        </a>
      );
    } else if (m[3] !== undefined) {
      out.push(<strong key={key}>{renderInline(m[3], key)}</strong>);
    } else {
      out.push(<em key={key}>{renderInline(m[4], key)}</em>);
    }
    last = INLINE.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function parseBlocks(content) {
  const blocks = [];
  let para = [];
  const flushPara = () => {
    const value = para.join('\n').replace(/^\n+|\n+$/g, '');
    if (value) blocks.push({ type: 'text', value });
    para = [];
  };
  const pushItem = (type, value) => {
    flushPara();
    const prev = blocks[blocks.length - 1];
    if (prev && prev.type === type) prev.items.push(value);
    else blocks.push({ type, items: [value] });
  };

  for (const raw of String(content || '').split('\n')) {
    const line = raw.trim();
    let m;
    if ((m = line.match(IMAGE_LINE))) {
      flushPara();
      blocks.push({ type: 'image', alt: m[1], src: m[2] });
    } else if ((m = line.match(HEADING))) {
      flushPara();
      blocks.push({ type: 'heading', level: m[1].length, value: m[2] });
    } else if ((m = line.match(BULLET))) {
      pushItem('ul', m[1]);
    } else if ((m = line.match(NUMBERED))) {
      pushItem('ol', m[1]);
    } else if ((m = line.match(QUOTE))) {
      pushItem('quote', m[1]);
    } else if (!line) {
      flushPara();
    } else {
      para.push(raw);
    }
  }
  flushPara();
  return blocks;
}

const HEADING_CLASS = { 1: 'fs-4', 2: 'fs-5', 3: 'fs-6' };

export default function PostContent({ content }) {
  const blocks = parseBlocks(content);
  return (
    <div className="small" style={{ lineHeight: 1.7 }}>
      {blocks.map((b, i) => {
        const k = `b${i}`;
        switch (b.type) {
          case 'image':
            return (
              <figure key={k} className="my-3 text-center">
                <img
                  src={b.src}
                  alt={b.alt || ''}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="img-fluid rounded-3"
                  style={{ maxHeight: 600 }}
                  onError={(e) => {
                    e.currentTarget.closest('figure').style.display = 'none'; // ảnh hỏng -> ẩn, không để khung trống
                  }}
                />
                {b.alt && <figcaption className="text-muted mt-1">{b.alt}</figcaption>}
              </figure>
            );
          case 'heading': {
            const Tag = `h${b.level + 1}`; // # -> h2 (h1 dành cho tiêu đề bài viết)
            return (
              <Tag key={k} className={`${HEADING_CLASS[b.level]} fw-bold mt-4 mb-2`}>
                {renderInline(b.value, k)}
              </Tag>
            );
          }
          case 'ul':
          case 'ol': {
            const Tag = b.type;
            return (
              <Tag key={k} className="mb-3">
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `${k}-${j}`)}</li>
                ))}
              </Tag>
            );
          }
          case 'quote':
            return (
              <blockquote key={k} className="border-start border-4 ps-3 text-muted fst-italic my-3">
                {b.items.map((it, j) => (
                  <div key={j}>{renderInline(it, `${k}-${j}`)}</div>
                ))}
              </blockquote>
            );
          default:
            return (
              <p key={k} style={{ whiteSpace: 'pre-line' }}>
                {renderInline(b.value, k)}
              </p>
            );
        }
      })}
    </div>
  );
}
