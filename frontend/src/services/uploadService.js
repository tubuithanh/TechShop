import api from './api';

export const uploadService = {
  // Tải tối đa 5 ảnh (mỗi ảnh <= 5MB) -> trả về danh sách link ảnh
  async uploadImages(files) {
    const form = new FormData();
    [...files].forEach((f) => form.append('images', f));
    const { data } = await api.post('/uploads', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    return data.data.urls;
  }
};
