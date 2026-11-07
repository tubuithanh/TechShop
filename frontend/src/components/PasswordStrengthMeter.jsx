function getStrength(password) {
  if (!password) return { score: 0, label: '', color: 'bg-light' };
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score: 1, label: 'Yếu', color: 'bg-danger' };
  if (score <= 3) return { score: 2, label: 'Trung bình', color: 'bg-warning' };
  return { score: 3, label: 'Mạnh', color: 'bg-success' };
}

export default function PasswordStrengthMeter({ password }) {
  const strength = getStrength(password);
  if (!password) return null;

  return (
    <div className="mt-1">
      <div className="d-flex gap-1" style={{ height: '0.375rem' }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className={`flex-fill rounded ${i <= strength.score ? strength.color : 'bg-light'}`} />
        ))}
      </div>
      <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>
        Độ mạnh mật khẩu: {strength.label}
      </div>
    </div>
  );
}
