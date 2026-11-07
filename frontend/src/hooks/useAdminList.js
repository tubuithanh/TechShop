import { useCallback, useEffect, useRef, useState } from 'react';

// Tải danh sách cho trang quản trị theo tham số tìm kiếm/lọc/phân trang. Chỉ nhận kết quả của lần gọi
// MỚI NHẤT - khi gõ nhanh, kết quả của từ khóa cũ về trễ sẽ không ghi đè kết quả mới.
// fetcher(params) trả về { data, total, totalPages } hoặc một mảng.
export default function useAdminList(fetcher, params) {
  const [state, setState] = useState({ data: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);
  const paramsKey = JSON.stringify(params);

  const reload = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    try {
      const res = await fetcher(JSON.parse(paramsKey));
      if (id !== latest.current) return;
      setState(Array.isArray(res) ? { data: res, total: res.length, totalPages: 1 } : { data: res.data || [], total: res.total || 0, totalPages: res.totalPages || 1 });
    } finally {
      if (id === latest.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, loading, reload, setData: (updater) => setState((s) => ({ ...s, data: updater(s.data) })) };
}
