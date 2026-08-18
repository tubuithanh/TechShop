function getStrength(password) {
  if (!password) return { score: 0, label: '', color: 'bg-gray-200' };
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score: 1, label: 'Yếu', color: 'bg-red-500' };
  if (score <= 3) return { score: 2, label: 'Trung bình', color: 'bg-yellow-500' };
  return { score: 3, label: 'Mạnh', color: 'bg-green-500' };
}

export default function PasswordStrengthMeter({ password }) {
  const strength = getStrength(password);
  if (!password) return null;

  return (
    <div className="mt-1">
      <div className="flex gap-1 h-1.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`flex-1 rounded ${i <= strength.score ? strength.color : 'bg-gray-200'}`} />
        ))}
      </div>
      <div className="text-xs mt-1 text-gray-500">Độ mạnh mật khẩu: {strength.label}</div>
    </div>
  );
}
