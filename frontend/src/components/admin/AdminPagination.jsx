import { Button } from 'react-bootstrap';

// Thanh phân trang dùng chung cho các trang danh sách trong khu vực quản trị -
// kích thước trang (limit) luôn lấy từ Cấu hình hệ thống (Admin > Cấu hình hệ thống)
// để đảm bảo mọi trang admin đều tuân theo cùng 1 cấu hình.
export default function AdminPagination({ page, totalPages, total, onChange }) {
  if (!totalPages || totalPages <= 1) return null;
  return (
    <div className="d-flex justify-content-between align-items-center mt-3">
      <span className="small text-muted">
        Trang {page}/{totalPages}
        {typeof total === 'number' && ` — ${total} bản ghi`}
      </span>
      <div className="d-flex gap-2">
        <Button variant="outline-secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Trước
        </Button>
        <Button variant="outline-secondary" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Sau
        </Button>
      </div>
    </div>
  );
}
