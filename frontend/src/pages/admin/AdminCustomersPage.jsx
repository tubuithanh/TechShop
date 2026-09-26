import { Badge, Button, Card, Form, Table } from 'react-bootstrap';
import { userService } from '../../services/userService';
import { useSettings } from '../../store/SettingsContext';
import AdminPagination from '../../components/admin/AdminPagination';
import AdminSearchBar from '../../components/admin/AdminSearchBar';
import useListQuery from '../../hooks/useListQuery';
import useAdminList from '../../hooks/useAdminList';

export default function AdminCustomersPage() {
  const { settings } = useSettings();
  const pageSize = settings.productsPerPage || 20;
  const query = useListQuery(['isActive']);
  const { data: customers, total, totalPages, loading, reload: load } = useAdminList(userService.getAllCustomers, {
    ...query.apiParams,
    limit: pageSize
  });
  const page = query.values.page;
  const setPage = query.setPage;
  const filters = [
    { key: 'isActive', label: 'Tài khoản', options: [{ value: 'true', label: 'Đang hoạt động' }, { value: 'false', label: 'Đã khóa' }] }
  ];

  const handleToggleActive = async (id, isActive) => {
    // Khóa tài khoản là hành động ảnh hưởng ngay tới khách hàng thật - trước đây bấm là khóa luôn,
    // không có bước xác nhận nào (khác các thao tác xóa khác trong trang admin đều có confirm()).
    const message = isActive
      ? 'Khóa tài khoản khách hàng này? Họ sẽ không thể đăng nhập cho tới khi được mở khóa lại.'
      : 'Mở khóa tài khoản khách hàng này?';
    if (!confirm(message)) return;
    await userService.toggleCustomerActive(id);
    load();
  };

  return (
    <div>
      <h1 className="fs-4 fw-bold mb-4">Quản lý khách hàng</h1>
      <AdminSearchBar query={query} placeholder="Tên, email, số điện thoại..." filters={filters} total={total} loading={loading} />
      <Card className="shadow-sm">
        <Table striped hover responsive className="mb-0">
          <thead>
            <tr className="text-muted">
              <th className="p-3">Họ tên</th>
              <th className="p-3">Email</th>
              <th className="p-3">SĐT</th>
              <th className="p-3">Trạng thái</th>
              <th className="p-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c._id}>
                <td className="p-3">{c.displayName}</td>
                <td className="p-3">{c.email}</td>
                <td className="p-3">{c.phoneNumber}</td>
                <td className="p-3">
                  <Badge bg={c.isActive ? 'success' : 'danger'}>
                    {c.isActive ? 'Đang hoạt động' : 'Đã khóa'}
                  </Badge>
                </td>
                <td className="p-3">
                  <Button variant="outline-primary" size="sm" onClick={() => handleToggleActive(c._id, c.isActive)}>
                    {c.isActive ? 'Khóa tài khoản' : 'Mở khóa'}
                  </Button>
                </td>
              </tr>
            ))}
            {!loading && customers.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-muted p-4">
                  Không tìm thấy kết quả phù hợp
                </td>
              </tr>
            )}
          </tbody>
        </Table>
        <Card.Body className="pt-0">
          <AdminPagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
        </Card.Body>
      </Card>
    </div>
  );
}
