import { useState } from 'react';
import { Card, Form, Button, Alert, Stack } from 'react-bootstrap';
import { useAuth } from '../../store/AuthContext';
import { userService } from '../../services/userService';
import { authService } from '../../services/authService';
import PasswordStrengthMeter from '../../components/PasswordStrengthMeter';

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({ displayName: user?.displayName || '', phoneNumber: user?.phoneNumber || '' });
  const [pwForm, setPwForm] = useState({ oldPassword: '', newPassword: '' });
  const [message, setMessage] = useState('');
  const [pwMessage, setPwMessage] = useState('');

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    try {
      const updated = await userService.updateProfile(form);
      setUser(updated);
      setMessage('Cập nhật thông tin thành công!');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwMessage('');
    try {
      await authService.changePassword(pwForm);
      setPwMessage('Đổi mật khẩu thành công!');
      setPwForm({ oldPassword: '', newPassword: '' });
    } catch (err) {
      setPwMessage(err.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  return (
    <Stack gap={4}>
      <Card>
        <Card.Body>
          <h2 className="fw-bold fs-5 mb-4">Thông tin tài khoản</h2>
          <Form onSubmit={handleUpdateProfile} style={{ maxWidth: '28rem' }}>
            <Form.Group className="mb-3">
              <Form.Label className="small text-muted">Email (không thể thay đổi)</Form.Label>
              <Form.Control disabled value={user?.email} className="bg-light" />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="small text-muted">Họ và tên</Form.Label>
              <Form.Control
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="small text-muted">Số điện thoại</Form.Label>
              <Form.Control
                value={form.phoneNumber}
                onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
              />
            </Form.Group>
            {message && (
              <Alert variant="success" className="small py-2">
                {message}
              </Alert>
            )}
            <Button type="submit" variant="primary" size="sm">
              Lưu thay đổi
            </Button>
          </Form>
        </Card.Body>
      </Card>

      <Card>
        <Card.Body>
          <h2 className="fw-bold fs-5 mb-4">Đổi mật khẩu</h2>
          <Form onSubmit={handleChangePassword} style={{ maxWidth: '28rem' }}>
            <Form.Group className="mb-3">
              <Form.Label className="small text-muted">Mật khẩu hiện tại</Form.Label>
              <Form.Control
                type="password"
                required
                value={pwForm.oldPassword}
                onChange={(e) => setPwForm({ ...pwForm, oldPassword: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="small text-muted">Mật khẩu mới</Form.Label>
              <Form.Control
                type="password"
                required
                minLength={6}
                value={pwForm.newPassword}
                onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
              />
              <PasswordStrengthMeter password={pwForm.newPassword} />
            </Form.Group>
            {pwMessage && (
              <Alert variant="success" className="small py-2">
                {pwMessage}
              </Alert>
            )}
            <Button type="submit" variant="dark" size="sm">
              Đổi mật khẩu
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </Stack>
  );
}
