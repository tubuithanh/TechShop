import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-xl font-bold mb-6 text-center">Đăng nhập</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium">Email</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full border rounded px-3 py-2 mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Mật khẩu</label>
          <input
            type="password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full border rounded px-3 py-2 mt-1"
          />
        </div>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 rounded disabled:opacity-50"
        >
          {loading ? 'Đang xử lý...' : 'Đăng nhập'}
        </button>
      </form>
      <p className="text-sm text-center mt-4">
        Chưa có tài khoản?{' '}
        <Link to="/register" className="text-red-600 underline">
          Đăng ký ngay
        </Link>
      </p>
      <div className="mt-6 text-xs text-gray-500 bg-gray-50 rounded p-3">
        <p className="font-medium mb-1">Tài khoản demo:</p>
        <p>Khách hàng: customer@example.com / customer123</p>
        <p>Quản trị: admin@example.com / admin123</p>
      </div>
    </div>
  );
}
