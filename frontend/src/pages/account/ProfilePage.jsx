import { useState } from 'react';
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
    <div className="space-y-8">
      <div className="bg-white border rounded-lg p-5">
        <h2 className="font-bold mb-4">Thông tin tài khoản</h2>
        <form onSubmit={handleUpdateProfile} className="space-y-3 max-w-md">
          <div>
            <label className="text-sm text-gray-500">Email (không thể thay đổi)</label>
            <input disabled value={user?.email} className="w-full border rounded px-3 py-2 mt-1 bg-gray-50" />
          </div>
          <div>
            <label className="text-sm text-gray-500">Họ và tên</label>
            <input
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              className="w-full border rounded px-3 py-2 mt-1"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500">Số điện thoại</label>
            <input
              value={form.phoneNumber}
              onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
              className="w-full border rounded px-3 py-2 mt-1"
            />
          </div>
          {message && <div className="text-sm text-green-600">{message}</div>}
          <button type="submit" className="bg-red-600 text-white px-4 py-2 rounded text-sm">
            Lưu thay đổi
          </button>
        </form>
      </div>

      <div className="bg-white border rounded-lg p-5">
        <h2 className="font-bold mb-4">Đổi mật khẩu</h2>
        <form onSubmit={handleChangePassword} className="space-y-3 max-w-md">
          <div>
            <label className="text-sm text-gray-500">Mật khẩu hiện tại</label>
            <input
              type="password"
              required
              value={pwForm.oldPassword}
              onChange={(e) => setPwForm({ ...pwForm, oldPassword: e.target.value })}
              className="w-full border rounded px-3 py-2 mt-1"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500">Mật khẩu mới</label>
            <input
              type="password"
              required
              minLength={6}
              value={pwForm.newPassword}
              onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
              className="w-full border rounded px-3 py-2 mt-1"
            />
            <PasswordStrengthMeter password={pwForm.newPassword} />
          </div>
          {pwMessage && <div className="text-sm text-green-600">{pwMessage}</div>}
          <button type="submit" className="bg-gray-800 text-white px-4 py-2 rounded text-sm">
            Đổi mật khẩu
          </button>
        </form>
      </div>
    </div>
  );
}
