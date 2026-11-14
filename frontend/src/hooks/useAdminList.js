// hooks/useAdminList.js - xem chú thích từng dòng bên dưới
import { useCallback, useEffect, useRef, useState } from 'react';

// Tải danh sách cho trang quản trị theo tham số tìm kiếm/lọc/phân trang. Chỉ nhận kết quả của lần gọi
// MỚI NHẤT - khi gõ nhanh, kết quả của từ khóa cũ về trễ sẽ không ghi đè kết quả mới.
// fetcher(params) trả về { data, total, totalPages } hoặc một mảng.
export default function useAdminList(fetcher, params) {
  const [state, setState] = useState({ data: [], total: 0, totalPages: 1, meta: {} }); // kết quả danh sách
  const [loading, setLoading] = useState(true);
  const latest = useRef(0); // số thứ tự lần gọi mới nhất
  const paramsKey = JSON.stringify(params); // tham số -> chuỗi để so sánh thay đổi

  const reload = useCallback(async () => {
    const id = ++latest.current; // đánh số lần gọi này
    setLoading(true);
    try {
      const res = await fetcher(JSON.parse(paramsKey)); // gọi API
      if (id !== latest.current) return; // đã có lần gọi mới hơn -> bỏ kết quả cũ
      // meta: các trường thêm của API (VD statusCounts của danh sách đơn hàng)
      setState(
        Array.isArray(res) // API trả mảng hoặc { data, total, totalPages }
          ? { data: res, total: res.length, totalPages: 1, meta: {} }
          : { data: res.data || [], total: res.total || 0, totalPages: res.totalPages || 1, meta: res }
      );
    } finally {
      if (id === latest.current) setLoading(false); // chỉ lần mới nhất được tắt "đang tải"
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  useEffect(() => {
    // SỬA LỖI: API lỗi -> trước đây sinh 'unhandled promise rejection'; giữ dữ liệu cũ, tắt trạng thái đang tải (finally ở trên)
    reload().catch((err) => console.error('[Danh sách] Không tải được dữ liệu:', err?.response?.data?.message || err.message));
  }, [reload]);

  return { ...state, loading, reload, setData: (updater) => setState((s) => ({ ...s, data: updater(s.data) })) }; // setData: sửa tại chỗ 1 dòng mà không tải lại
}
