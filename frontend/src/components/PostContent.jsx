// Nội dung bài viết: văn bản thường (giữ xuống dòng) + dòng ảnh dạng "![mô tả](https://...)" hiển thị thành ảnh.
// Không dùng HTML (dangerouslySetInnerHTML) -> nội dung nhập từ nguồn ngoài không thể chèn mã độc.
const IMAGE_LINE = /^!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)$/;

export default function PostContent({ content }) {
  const blocks = [];
  let text = [];
  const flush = () => {
    if (text.length) blocks.push({ type: 'text', value: text.join('\n') });
    text = [];
  };
  for (const line of String(content || '').split('\n')) {
    const m = line.trim().match(IMAGE_LINE);
    if (m) {
      flush();
      blocks.push({ type: 'image', alt: m[1], src: m[2] });
    } else {
      text.push(line);
    }
  }
  flush();

  return (
    <div className="small" style={{ lineHeight: 1.7 }}>
      {blocks.map((b, i) =>
        b.type === 'image' ? (
          <figure key={i} className="my-3 text-center">
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
          </figure>
        ) : (
          <div key={i} style={{ whiteSpace: 'pre-line' }}>
            {b.value.replace(/^\n+|\n+$/g, '')}
          </div>
        )
      )}
    </div>
  );
}
