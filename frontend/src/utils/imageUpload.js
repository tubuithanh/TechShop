// Đọc file ảnh từ máy, resize + nén rồi trả về dạng data URI (base64) - không cần
// backend/server lưu trữ file hay dịch vụ ảnh bên thứ ba nào (Cloudinary/S3...).
export function resizeImageToDataUrl(file, maxDim = 1000, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Không đọc được file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('File không phải là ảnh hợp lệ'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
