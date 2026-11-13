import { useEffect, useState } from 'react';
import { Button, Spinner, Form } from 'react-bootstrap';
import { LightningChargeFill, GeoAlt, Clock } from 'react-bootstrap-icons';
import api from '../services/api';

const vnd = (v) => (v || 0).toLocaleString('vi-VN') + 'đ';
const hhmm = (d) => new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

// Lựa chọn GIAO HỎA TỐC ở trang Thanh toán: lấy vị trí khách (GPS trình duyệt) -> hỏi máy chủ giỏ hàng có giao hỏa tốc
// được không (đúng sản phẩm trong khung giờ quản lý mở, còn hàng, trong bán kính) -> khách chọn / bỏ chọn.
// value: { windowId, lat, lng, fee, storeId, ... } khi đang chọn hỏa tốc; onChange(value | null)
export default function ExpressCheckout({ cartKey, value, onChange }) {
  const [hasExpress, setHasExpress] = useState(false);
  const [state, setState] = useState({ status: 'idle' }); // idle | locating | checking | ok | fail
  const [point, setPoint] = useState(null);

  // Có khung giờ hỏa tốc nào đang mở không (ẩn hẳn khối này nếu không)
  useEffect(() => { api.get('/express/active').then((r) => setHasExpress(r.data.data.length > 0)).catch(() => {}); }, []);
  // Giỏ đổi -> kiểm tra lại với vị trí đã có
  useEffect(() => { if (point) check(point); else onChange(null); }, [cartKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const check = async (p) => {
    setState({ status: 'checking' });
    try {
      const { data } = await api.post('/express/check', p);
      if (data.data.ok) { setState({ status: 'ok', info: data.data }); if (value) onChange({ ...data.data, ...p }); }
      else { setState({ status: 'fail', reason: data.data.reason }); onChange(null); }
    } catch (err) { setState({ status: 'fail', reason: err.response?.data?.message || 'Không kiểm tra được' }); onChange(null); }
  };
  const locate = () => {
    if (!navigator.geolocation) return setState({ status: 'fail', reason: 'Trình duyệt không hỗ trợ lấy vị trí' });
    setState({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (pos) => { const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }; setPoint(p); check(p); },
      () => setState({ status: 'fail', reason: 'Bạn chưa cho phép lấy vị trí. Bật quyền vị trí cho trang web để kiểm tra giao hỏa tốc.' }),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  if (!hasExpress) return null;
  const info = state.info;
  return (
    <div className={`express-box ${value ? 'selected' : ''}`}>
      <div className="d-flex align-items-center gap-2">
        <LightningChargeFill className="text-warning" size={20} />
        <div className="flex-grow-1">
          <div className="fw-semibold small">Giao hỏa tốc trong 2 giờ</div>
          <div className="text-muted" style={{ fontSize: '0.78rem' }}>Shipper của chi nhánh gần nhất liên hệ ngay sau khi bạn đặt</div>
        </div>
        {state.status === 'idle' || state.status === 'fail'
          ? <Button size="sm" variant="warning" onClick={locate}><GeoAlt className="me-1" />Kiểm tra vị trí</Button>
          : state.status !== 'ok' && <Spinner size="sm" />}
      </div>
      {state.status === 'fail' && <div className="small text-danger mt-2">{state.reason}</div>}
      {state.status === 'ok' && (
        <Form.Check className="mt-2" type="switch" id="express-switch" checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked ? { ...info, ...point } : null)}
          label={
            <span className="small">
              <b>Chọn giao hỏa tốc (+{vnd(info.fee)})</b> · từ {info.store.name}, cách bạn {info.distanceKm} km
              <span className="d-block text-success"><Clock className="me-1" />Nhận hàng trước {hhmm(new Date(Date.now() + info.slaMinutes * 60000))} hôm nay</span>
            </span>
          } />
      )}
    </div>
  );
}
