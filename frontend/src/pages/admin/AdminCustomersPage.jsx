import { useEffect, useState } from 'react';
import { Badge, Button, Card, Form, Table } from 'react-bootstrap';
import { userService } from '../../services/userService';

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [keyword, setKeyword] = useState('');

  const load = () => userService.getAllCustomers({ keyword }).then((res) => setCustomers(res.data));

  useEffect(() => {
    load();
  }, [keyword]);

  const handleToggleActive = async (id) => {
    await userService.toggleCustomerActive(id);
    load();
  };

  return (
    <div>
      <h1 className="fs-4 fw-bold mb-4">Quản lý khách hàng</h1>
      <Form.Control
        placeholder="Tìm theo tên, email, số điện thoại..."
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        className="mb-4"
        style={{ maxWidth: '24rem' }}
      />
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
                  <Button variant="outline-primary" size="sm" onClick={() => handleToggleActive(c._id)}>
                    {c.isActive ? 'Khóa tài khoản' : 'Mở khóa'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
