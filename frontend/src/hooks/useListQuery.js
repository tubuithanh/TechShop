// hooks/useListQuery.js - xem chú thích từng dòng bên dưới
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

// Trạng thái danh sách trang quản trị (từ khóa q, bộ lọc, số trang) lưu trên URL: tải lại trang hoặc gửi
// link cho đồng nghiệp vẫn ra đúng kết quả; nút Back của trình duyệt quay lại lần tìm trước.
// `filterKeys`: tên các bộ lọc của trang (VD: ['status', 'from', 'to']).
export default function useListQuery(filterKeys = []) {
  const [params, setParams] = useSearchParams(); // đọc / ghi tham số trên URL (?q=&page=)
  const keysSig = filterKeys.join(','); // chuỗi ổn định để dùng làm phụ thuộc

  const values = useMemo(() => {
    const v = { q: params.get('q') || '', page: Math.max(1, Number(params.get('page')) || 1) }; // từ khóa + trang (>= 1)
    for (const k of keysSig ? keysSig.split(',') : []) v[k] = params.get(k) || ''; // các bộ lọc
    return v;
  }, [params, keysSig]);

  // Đổi từ khóa/bộ lọc thì quay về trang 1; giá trị rỗng thì bỏ khỏi URL cho gọn
  const update = useCallback(
    (changes) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev); // chép tham số hiện tại
          for (const [k, val] of Object.entries(changes)) {
            if (val === '' || val === null || val === undefined) next.delete(k); // rỗng -> bỏ khỏi URL
            else next.set(k, String(val));
          }
          if (!('page' in changes)) next.delete('page'); // đổi bộ lọc -> về trang 1
          return next;
        },
        { replace: true } // không tạo thêm mục lịch sử trình duyệt cho mỗi lần gõ
      ),
    [setParams]
  );

  const setPage = useCallback((page) => update({ page: page > 1 ? page : '' }), [update]); // trang 1 thì không ghi lên URL
  const reset = useCallback(
    () => update(Object.fromEntries(['q', ...(keysSig ? keysSig.split(',') : [])].map((k) => [k, '']))),
    [update, keysSig]
  );

  // Tham số gửi lên API (bỏ giá trị rỗng)
  const apiParams = useMemo(() => Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '')), [values]); // bỏ giá trị rỗng trước khi gửi API

  return { values, apiParams, update, setPage, reset };
}
