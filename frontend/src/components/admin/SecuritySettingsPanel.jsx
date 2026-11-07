import { useEffect, useState } from 'react';
import { Form, Alert, Spinner, Badge, Row, Col, Table, Button } from 'react-bootstrap';
import { ShieldLockFill, ShieldCheck, ShieldExclamation, ArrowCounterclockwise } from 'react-bootstrap-icons';
import { settingService } from '../../services/settingService';

// Tab "Bảo mật" trong Cấu hình hệ thống: bật/tắt chống lạm dụng & tấn công dồn dập.
// Lưu ngay khi gạt công tắc (API /settings/security), không dùng nút Lưu chung của trang.
export default function SecuritySettingsPanel() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [limits, setLimits] = useState({}); // { key: chuỗi đang nhập }

  const receive = (d) => {
    setData(d);
    setLimits(Object.fromEntries(d.limits.map((l) => [l.key, String(l.value)])));
  };

  useEffect(() => {
    settingService
      .getSecuritySettings()
      .then(receive)
      .catch((err) => setFeedback({ type: 'danger', message: err.response?.data?.message || 'Không tải được cấu hình bảo mật' }));
  }, []);

  const toggle = async (enabled) => {
    if (
      !enabled &&
      !confirm(
        'TẮT chống lạm dụng & tấn công dồn dập?\n\nWebsite sẽ không còn chặn việc dò mật khẩu, gửi OTP/email hàng loạt, spam đơn hàng, đánh giá và tải ảnh. Chỉ nên tắt tạm thời khi thật sự cần.'
      )
    ) {
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const res = await settingService.updateSecuritySettings({ rateLimitEnabled: enabled });
      receive(res.data);
      setFeedback({ type: enabled ? 'success' : 'warning', message: res.message });
    } catch (err) {
      setFeedback({ type: 'danger', message: err.response?.data?.message || 'Không lưu được, vui lòng thử lại' });
    } finally {
      setBusy(false);
    }
  };

  const limitError = (l) => {
    const v = limits[l.key];
    if (!/^\d+$/.test(v || '')) return 'Nhập số nguyên';
    const n = Number(v);
    if (n < l.min) return `Tối thiểu ${l.min}`;
    if (n > l.max) return `Tối đa ${l.max.toLocaleString('vi-VN')}`;
    return null;
  };

  const saveLimits = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const payload = Object.fromEntries(Object.entries(limits).map(([k, v]) => [k, Number(v)]));
      const res = await settingService.updateSecuritySettings({ limits: payload });
      receive(res.data);
      setFeedback({ type: 'success', message: res.message });
    } catch (err) {
      setFeedback({ type: 'danger', message: err.response?.data?.message || 'Không lưu được, vui lòng thử lại' });
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return feedback ? (
      <Alert variant={feedback.type}>{feedback.message}</Alert>
    ) : (
      <div className="text-center py-4">
        <Spinner animation="border" size="sm" />
      </div>
    );
  }

  const enabled = data.rateLimitEnabled;
  return (
    <div>
      <h2 className="fs-6 fw-bold mb-3 d-flex align-items-center gap-2 border-start border-4 border-primary ps-2">
        <ShieldLockFill className="text-primary" /> Bảo mật
      </h2>

      {feedback && (
        <Alert variant={feedback.type} dismissible onClose={() => setFeedback(null)} className="small py-2">
          {feedback.message}
        </Alert>
      )}
      {data.envDisabled && (
        <Alert variant="warning" className="small py-2">
          Máy chủ đang đặt biến môi trường <code>RATE_LIMIT_DISABLED=true</code> nên giới hạn luôn TẮT, bất kể công tắc bên
          dưới. Xóa biến này trên máy chủ để công tắc có hiệu lực.
        </Alert>
      )}

      <div className="border rounded-3 p-3">
        <Row className="g-3 align-items-start">
          <Col md={5}>
            <Form.Check
              type="switch"
              id="rate-limit-switch"
              className="fs-6"
              checked={enabled}
              disabled={busy}
              onChange={(e) => toggle(e.target.checked)}
              label={<span className="fw-medium">Chống lạm dụng & tấn công dồn dập</span>}
            />
            <div className="mt-2 small">
              Trạng thái:{' '}
              {enabled ? (
                <Badge bg="success">
                  <ShieldCheck className="me-1" />
                  Đang bật
                </Badge>
              ) : (
                <Badge bg="danger">
                  <ShieldExclamation className="me-1" />
                  Đang tắt
                </Badge>
              )}
              {busy && <Spinner size="sm" className="ms-2" />}
            </div>
            <p className="small text-muted mt-2 mb-0">
              Giới hạn số lần mỗi địa chỉ IP được gửi yêu cầu tới website trong 15 phút. Vượt giới hạn, người dùng nhận
              thông báo "thử lại sau ít phút". Thay đổi có hiệu lực ngay.
            </p>
          </Col>
          <Col md={7}>
            <div className={`rounded-3 p-3 small mb-2 ${enabled ? 'bg-success-subtle' : 'bg-light'}`}>
              <div className="fw-medium mb-1">
                <ShieldCheck className="text-success me-1" />
                Khi BẬT (khuyên dùng)
              </div>
              <ul className="mb-0 ps-3">
                <li>Chặn dò mật khẩu (brute-force) ở trang đăng nhập.</li>
                <li>Chặn gửi mã OTP / email quên mật khẩu hàng loạt - tránh tốn hạn mức email và bị đánh dấu spam.</li>
                <li>Chặn spam đơn hàng, đánh giá và tải ảnh (làm đầy bộ nhớ lưu ảnh).</li>
                <li>Giảm nguy cơ máy chủ quá tải khi bị gọi API dồn dập hoặc bị quét dữ liệu.</li>
                <li>
                  Người dùng bình thường gần như không bị ảnh hưởng; riêng khi kiểm thử hoặc nhiều người dùng chung 1 mạng
                  (cùng IP) có thể bị báo "thử lại sau ít phút".
                </li>
              </ul>
            </div>
            <div className={`rounded-3 p-3 small ${!enabled ? 'bg-danger-subtle' : 'bg-light'}`}>
              <div className="fw-medium mb-1">
                <ShieldExclamation className="text-danger me-1" />
                Khi TẮT
              </div>
              <ul className="mb-0 ps-3">
                <li>Các giới hạn ở bảng bên dưới không còn tác dụng - kẻ xấu có thể thử mật khẩu không giới hạn.</li>
                <li>Có thể bị lợi dụng gửi OTP/email hàng loạt, spam đơn hàng, đánh giá, tải ảnh.</li>
                <li>Máy chủ dễ quá tải hơn khi bị tấn công dồn dập.</li>
                <li>Chỉ nên tắt tạm thời, VD khi chạy kiểm thử tự động hoặc demo cho nhiều người trên cùng 1 mạng.</li>
              </ul>
            </div>
          </Col>
        </Row>

        <div className="fw-medium small mt-3 mb-1">Các giới hạn (mỗi địa chỉ IP / {data.windowMinutes} phút)</div>
        <p className="small text-muted mb-2">
          Số lần tối đa được phép trong {data.windowMinutes} phút; vượt quá sẽ bị chặn tới khi hết {data.windowMinutes} phút
          đó. Số nhỏ = chặt hơn (an toàn hơn nhưng dễ chặn nhầm người dùng thật), số lớn = thoáng hơn.
        </p>
        <Table size="sm" bordered className="small mb-2 align-middle" style={{ maxWidth: 620 }}>
          <thead className="text-muted">
            <tr>
              <th>Chức năng</th>
              <th style={{ width: 170 }}>Số lần cho phép</th>
              <th style={{ width: 110 }}>Mặc định</th>
            </tr>
          </thead>
          <tbody>
            {data.limits.map((l) => {
              const error = limitError(l);
              const changed = Number(limits[l.key]) !== l.default;
              return (
                <tr key={l.key} className={enabled ? '' : 'text-muted'}>
                  <td className={enabled ? '' : 'text-decoration-line-through'}>{l.label}</td>
                  <td>
                    <Form.Control
                      size="sm"
                      type="number"
                      id={`limit-${l.key}`}
                      min={l.min}
                      max={l.max}
                      step={1}
                      value={limits[l.key] ?? ''}
                      isInvalid={!!error}
                      onChange={(e) => setLimits((cur) => ({ ...cur, [l.key]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                    />
                    {error && <Form.Control.Feedback type="invalid">{error}</Form.Control.Feedback>}
                  </td>
                  <td className="text-nowrap">
                    {l.default.toLocaleString('vi-VN')}
                    {changed && (
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 ms-2 align-baseline"
                        title="Về giá trị mặc định"
                        onClick={() => setLimits((cur) => ({ ...cur, [l.key]: String(l.default) }))}
                      >
                        <ArrowCounterclockwise />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <p className="small text-muted">
          "Toàn bộ API" tối thiểu {data.limits.find((l) => l.key === 'api')?.min} để quản trị viên không tự bị khóa khỏi trang
          quản trị.
        </p>
        <div className="d-flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={
              busy ||
              data.limits.some((l) => limitError(l)) ||
              data.limits.every((l) => Number(limits[l.key]) === l.value)
            }
            onClick={saveLimits}
          >
            {busy ? 'Đang lưu...' : 'Lưu giới hạn'}
          </Button>
          <Button
            variant="outline-secondary"
            size="sm"
            disabled={busy || data.limits.every((l) => Number(limits[l.key]) === l.default)}
            onClick={() => setLimits(Object.fromEntries(data.limits.map((l) => [l.key, String(l.default)])))}
          >
            <ArrowCounterclockwise className="me-1" />
            Khôi phục tất cả về mặc định
          </Button>
        </div>
      </div>
    </div>
  );
}
