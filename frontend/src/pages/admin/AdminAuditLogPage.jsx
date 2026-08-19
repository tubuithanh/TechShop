import { useEffect, useState } from 'react';
import { Container, Table, Button, Badge } from 'react-bootstrap';
import { auditLogService } from '../../services/auditLogService';
import { useSettings } from '../../store/SettingsContext';

function actionBadgeVariant(action) {
  if (!action) return 'secondary';
  if (action.startsWith('TAO_MOI')) return 'success';
  if (action.startsWith('CAP_NHAT')) return 'primary';
  if (action.startsWith('XOA')) return 'danger';
  return 'secondary';
}

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const { settings } = useSettings();
  const pageSize = settings.productsPerPage || 20;

  useEffect(() => {
    auditLogService.getLogs({ page, limit: pageSize }).then((res) => {
      setLogs(res.data);
      setTotalPages(res.totalPages);
    });
  }, [page, pageSize]);

  return (
    <Container fluid>
      <h1 className="fs-4 fw-bold mb-2">Nhật ký thao tác quản trị (Audit Log)</h1>
      <p className="small text-muted mb-4">
        Ghi lại mọi thao tác thêm/sửa/xóa do quản trị viên và nhân viên thực hiện, phục vụ truy vết khi có sự cố.
      </p>

      <div className="bg-white rounded-3 shadow-sm">
        <Table striped hover responsive className="mb-0 align-middle">
          <thead>
            <tr className="text-muted">
              <th>Thời gian</th>
              <th>Người thực hiện</th>
              <th>Vai trò</th>
              <th>Hành động</th>
              <th>Đường dẫn</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log._id}>
                <td className="text-nowrap">{new Date(log.createdAt).toLocaleString('vi-VN')}</td>
                <td>{log.userName}</td>
                <td>{log.userRole}</td>
                <td>
                  <Badge bg={actionBadgeVariant(log.action)}>{log.action}</Badge>
                </td>
                <td className="small text-muted">{log.path}</td>
                <td className="small text-muted">{log.ip}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-muted">
                  Chưa có nhật ký nào
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>

      <div className="d-flex justify-content-center align-items-center gap-2 mt-4">
        <Button variant="outline-secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Trước
        </Button>
        <span className="small px-2">
          Trang {page}/{totalPages || 1}
        </span>
        <Button variant="outline-secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
          Sau
        </Button>
      </div>
    </Container>
  );
}
