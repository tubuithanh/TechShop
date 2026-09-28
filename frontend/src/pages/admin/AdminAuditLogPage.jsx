import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, Table, Button, Badge, Alert } from 'react-bootstrap';
import { Trash } from 'react-bootstrap-icons';
import { auditLogService } from '../../services/auditLogService';
import { useSettings } from '../../store/SettingsContext';
import AdminPagination from '../../components/admin/AdminPagination';
import AdminSearchBar from '../../components/admin/AdminSearchBar';
import useListQuery from '../../hooks/useListQuery';
import useAdminList from '../../hooks/useAdminList';

const FILTERS = [
  {
    key: 'method',
    label: 'Hành động',
    options: [
      { value: 'POST', label: 'Tạo mới' },
      { value: 'PUT', label: 'Cập nhật (PUT)' },
      { value: 'PATCH', label: 'Cập nhật (PATCH)' },
      { value: 'DELETE', label: 'Xóa' }
    ]
  },
  { key: 'role', label: 'Vai trò', options: [{ value: 'admin', label: 'Admin' }, { value: 'staff', label: 'Nhân viên' }] },
  { key: 'from', label: 'Từ ngày', type: 'date' },
  { key: 'to', label: 'Đến ngày', type: 'date' }
];

function actionBadgeVariant(action) {
  if (!action) return 'secondary';
  if (action.startsWith('TAO_MOI')) return 'success';
  if (action.startsWith('CAP_NHAT')) return 'primary';
  if (action.startsWith('XOA')) return 'danger';
  return 'secondary';
}

export default function AdminAuditLogPage() {
  const { settings } = useSettings();
  const pageSize = settings.productsPerPage || 20;
  const retentionDays = settings.auditLogRetentionDays ?? 30;
  const query = useListQuery(FILTERS.map((f) => f.key));
  const { data: logs, total, totalPages, loading, reload } = useAdminList(auditLogService.getLogs, {
    ...query.apiParams,
    limit: pageSize
  });
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState(null);

  const handleDeleteAll = async () => {
    if (!confirm('Xóa TẤT CẢ nhật ký thao tác? Hành động này không thể hoàn tác.')) return;
    setDeleting(true);
    try {
      const res = await auditLogService.deleteAll();
      setMessage({ variant: 'success', text: res.message });
      query.reset();
      reload();
    } catch (err) {
      setMessage({ variant: 'danger', text: err.response?.data?.message || 'Xóa nhật ký thất bại' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Container fluid>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
        <h1 className="fs-4 fw-bold mb-0">Nhật ký thao tác quản trị (Audit Log)</h1>
        <Button variant="outline-danger" size="sm" onClick={handleDeleteAll} disabled={deleting || total === 0}>
          <Trash className="me-1" /> {deleting ? 'Đang xóa...' : 'Xóa tất cả nhật ký'}
        </Button>
      </div>
      <p className="small text-muted mb-3">
        Ghi lại mọi thao tác thêm/sửa/xóa do quản trị viên và nhân viên thực hiện, phục vụ truy vết khi có sự cố.{' '}
        {retentionDays > 0 ? (
          <>Nhật ký được lưu trong <strong>{retentionDays} ngày</strong> gần nhất, cũ hơn sẽ tự động xóa.</>
        ) : (
          <strong className="text-danger">Đang tắt ghi nhật ký (số ngày lưu = 0).</strong>
        )}{' '}
        <Link to="/admin/settings?tab=audit">Thay đổi</Link>
      </p>
      {message && (
        <Alert variant={message.variant} dismissible onClose={() => setMessage(null)} className="py-2 small">
          {message.text}
        </Alert>
      )}
      <AdminSearchBar
        query={query}
        placeholder="Người thực hiện, hành động, đường dẫn, IP..."
        filters={FILTERS}
        total={total}
        loading={loading}
      />

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
              <th>Dữ liệu gửi lên</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log._id}>
                <td className="text-nowrap">{new Date(log.createdAt).toLocaleString('vi-VN')}</td>
                {/* Backend trả về adminName/adminRole (đúng tên field của model AuditLog) -
                    trước đây đọc nhầm log.userName/log.userRole (không tồn tại) nên 2 cột này
                    luôn hiển thị trống với mọi dòng. */}
                <td>{log.adminName}</td>
                <td>{log.adminRole}</td>
                <td>
                  <Badge bg={actionBadgeVariant(log.action)}>{log.action}</Badge>
                </td>
                <td className="small text-muted">{log.path}</td>
                <td className="small text-muted">{log.ip}</td>
                <td className="small text-muted" style={{ maxWidth: 260 }}>
                  {log.metadata?.requestBody ? (
                    <code className="small" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {JSON.stringify(log.metadata.requestBody)}
                    </code>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-muted">
                  {loading ? 'Đang tải...' : 'Không có nhật ký nào'}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>

      <div className="mt-3">
        <AdminPagination page={query.values.page} totalPages={totalPages} total={total} onChange={query.setPage} />
      </div>
    </Container>
  );
}
