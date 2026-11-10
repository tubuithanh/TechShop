// Bọc một ô trong dấu ngoặc kép. Nếu nội dung có sẵn dấu " thì nhân đôi nó (quy tắc của CSV),
// để dấu phẩy hay xuống dòng bên trong tên khách không làm vỡ cột.
function cell(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

// rows: mảng các dòng, mỗi dòng là mảng giá trị. Ví dụ: [['DH001', 'Nguyễn A'], ...]
export function downloadCsv(filename, header, rows) {
  // 1) Ghép thành chuỗi CSV: các ô cách nhau bằng dấu phẩy, các dòng cách nhau bằng xuống dòng
  const lines = [header, ...rows].map((row) => row.map(cell).join(','));
  const csv = lines.join('\r\n');

  // 2) '﻿' (BOM) giúp Excel hiểu file là UTF-8. Thiếu nó, tiếng Việt sẽ bị lỗi font.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });

  // 3) Tạo một link ảo trỏ tới file, tự bấm vào để tải, rồi dọn dẹp
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
