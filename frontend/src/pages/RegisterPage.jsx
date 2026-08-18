import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { authService } from '../services/authService';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';

const STEP_EMAIL = 1;
const STEP_OTP = 2;
const STEP_INFO = 3;

export default function RegisterPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(STEP_EMAIL);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtpHint, setDevOtpHint] = useState('');
  const [form, setForm] = useState({ displayName: '', phoneNumber: '', password: '', acceptTerms: false });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authService.requestRegisterOtp(email);
      setDevOtpHint(res.devOtpPreview || '');
      setStep(STEP_OTP);
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể gửi OTP, vui lòng thử lại');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authService.verifyRegisterOtp(email, otp);
      setStep(STEP_INFO);
    } catch (err) {
      setError(err.response?.data?.message || 'Mã OTP không đúng');
    } finally {
      setLoading(false);
    }
  };

  const handleFinishRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.acceptTerms) {
      setError('Bạn cần đồng ý với Điều khoản sử dụng và Chính sách bảo mật');
      return;
    }
    setLoading(true);
    try {
      const payload = { email, ...form };
      const user = await authService.register(payload);
      setUser(user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng ký thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-xl font-bold mb-2 text-center">Đăng ký tài khoản</h1>

      <div className="flex items-center justify-center gap-2 mb-6 text-xs">
        {[
          { id: STEP_EMAIL, label: 'Email' },
          { id: STEP_OTP, label: 'Xác thực OTP' },
          { id: STEP_INFO, label: 'Thông tin' }
        ].map((s, idx) => (
          <div key={s.id} className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-white ${
                step >= s.id ? 'bg-red-600' : 'bg-gray-300'
              }`}
            >
              {idx + 1}
            </div>
            <span className={step >= s.id ? 'text-red-600' : 'text-gray-400'}>{s.label}</span>
            {idx < 2 && <span className="text-gray-300">—</span>}
          </div>
        ))}
      </div>

      {error && <div className="text-red-600 text-sm mb-3 text-center">{error}</div>}

      {step === STEP_EMAIL && (
        <form onSubmit={handleRequestOtp} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border rounded px-3 py-2 mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">
              Chúng tôi sẽ gửi mã xác thực (OTP) gồm 6 chữ số tới email này để xác nhận đây là email hợp lệ.
            </p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 rounded disabled:opacity-50"
          >
            {loading ? 'Đang gửi...' : 'Gửi mã xác thực'}
          </button>
        </form>
      )}

      {step === STEP_OTP && (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <p className="text-sm text-gray-600">
            Nhập mã OTP gồm 6 chữ số đã gửi tới <strong>{email}</strong>
          </p>
          {devOtpHint && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs rounded p-2">
              [Chế độ DEMO] Mã OTP của bạn là: <strong>{devOtpHint}</strong>
              <br />
              (Trong môi trường thật, mã này sẽ được gửi qua email/SMS thay vì hiển thị ở đây)
            </div>
          )}
          <input
            required
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            placeholder="Nhập mã OTP 6 số"
            className="w-full border rounded px-3 py-2 text-center text-lg tracking-widest"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 rounded disabled:opacity-50"
          >
            {loading ? 'Đang xác thực...' : 'Xác thực'}
          </button>
          <button type="button" onClick={() => setStep(STEP_EMAIL)} className="w-full text-sm text-gray-500 underline">
            Đổi email khác / Gửi lại mã
          </button>
        </form>
      )}

      {step === STEP_INFO && (
        <form onSubmit={handleFinishRegister} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Họ và tên</label>
            <input
              required
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              className="w-full border rounded px-3 py-2 mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Số điện thoại</label>
            <input
              value={form.phoneNumber}
              onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
              className="w-full border rounded px-3 py-2 mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Mật khẩu</label>
            <input
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full border rounded px-3 py-2 mt-1"
            />
            <PasswordStrengthMeter password={form.password} />
          </div>
          <label className="flex items-start gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={form.acceptTerms}
              onChange={(e) => setForm({ ...form, acceptTerms: e.target.checked })}
              className="mt-0.5"
            />
            <span>
              Tôi đồng ý với{' '}
              <Link to="/terms" className="text-red-600 underline">
                Điều khoản sử dụng
              </Link>{' '}
              và{' '}
              <Link to="/privacy" className="text-red-600 underline">
                Chính sách bảo mật
              </Link>{' '}
              của TechShop
            </span>
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 rounded disabled:opacity-50"
          >
            {loading ? 'Đang tạo tài khoản...' : 'Hoàn tất đăng ký'}
          </button>
        </form>
      )}

      <p className="text-sm text-center mt-4">
        Đã có tài khoản?{' '}
        <Link to="/login" className="text-red-600 underline">
          Đăng nhập
        </Link>
      </p>
    </div>
  );
}
