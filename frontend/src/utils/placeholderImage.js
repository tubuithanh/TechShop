// Ảnh giữ chỗ dạng SVG nhúng trực tiếp (data URI) - không phụ thuộc dịch vụ ảnh bên thứ ba
// (via.placeholder.com/placehold.co...) nên luôn hiển thị được kể cả khi mạng chặn CDN ngoài.
export function placeholderImage(width, height, label = 'No Image', bg = 'e5e7eb', textColor = '9ca3af') {
  const fontSize = Math.round(Math.min(width, height) * 0.09);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<rect width="100%" height="100%" fill="#${bg}"/>` +
    `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#${textColor}" ` +
    `font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
