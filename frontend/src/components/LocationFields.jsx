import { useEffect, useMemo, useRef, useState } from 'react';
import { Form, ListGroup, Spinner } from 'react-bootstrap';
import { locationService } from '../services/locationService';

// "Phường Bến Thành" -> "phuong ben thanh" (bỏ dấu để gõ không dấu vẫn ra)
const normalize = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim();

const MAX_SUGGESTIONS = 50;

// Ô chọn Tỉnh/Thành phố + ô gõ Phường/Xã có danh sách gợi ý theo đúng tỉnh đang chọn.
// Dữ liệu tỉnh/phường do admin quản lý (Admin -> Tỉnh thành & phường xã).
// Giá trị lưu vẫn là TÊN (city, ward) như trước, nên địa chỉ/đơn hàng cũ vẫn hiển thị bình thường.
export default function LocationFields({
  city,
  ward,
  onChange, // ({ city?, ward? }) => void
  size,
  idPrefix = 'loc',
  required = false,
  cityInvalid,
  cityFeedback,
  onCityBlur,
  className = ''
}) {
  const [provinces, setProvinces] = useState([]);
  const [wards, setWards] = useState([]);
  const [loadingWards, setLoadingWards] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [touchedWard, setTouchedWard] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    locationService.getProvinces().then(setProvinces).catch(() => setProvinces([]));
  }, []);

  const isKnownProvince = provinces.some((p) => p.name === city);

  useEffect(() => {
    if (!city || !isKnownProvince) {
      setWards([]);
      return undefined;
    }
    let alive = true;
    setLoadingWards(true);
    locationService
      .getWards(city)
      .then((list) => alive && setWards(list))
      .catch(() => alive && setWards([]))
      .finally(() => alive && setLoadingWards(false));
    return () => {
      alive = false;
    };
  }, [city, isKnownProvince]);

  // Đóng danh sách khi bấm ra ngoài
  useEffect(() => {
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const suggestions = useMemo(() => {
    const q = normalize(ward);
    const words = q.split(/\s+/).filter(Boolean);
    const list = words.length ? wards.filter((w) => words.every((word) => normalize(w.name).includes(word))) : wards;
    return list.slice(0, MAX_SUGGESTIONS);
  }, [wards, ward]);

  const wardMatches = !ward || wards.some((w) => w.name === ward);
  const wardInvalid = touchedWard && !open && wards.length > 0 && !!ward && !wardMatches;

  const pick = (name) => {
    onChange({ ward: name });
    setOpen(false);
    setTouchedWard(true);
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (!open || !suggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(suggestions[highlight]?.name);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const wardPlaceholder = !city ? 'Chọn tỉnh/thành phố trước' : 'Gõ để tìm phường/xã';

  return (
    <div className={`d-flex flex-column gap-2 ${className}`}>
      <Form.Group>
        <Form.Select
          size={size}
          id={`${idPrefix}-city`}
          aria-label="Tỉnh/Thành phố"
          value={city || ''}
          required={required}
          isInvalid={cityInvalid}
          onBlur={onCityBlur}
          onChange={(e) => {
            // Đổi tỉnh -> phường/xã đang nhập không còn đúng nữa
            onChange({ city: e.target.value, ward: '' });
            setTouchedWard(false);
          }}
        >
          <option value="">{required ? 'Tỉnh/Thành phố *' : 'Tỉnh/Thành phố'}</option>
          {provinces.map((p) => (
            <option key={p._id} value={p.name}>
              {p.name}
            </option>
          ))}
          {/* Địa chỉ cũ nhập tay không khớp danh sách -> vẫn giữ để khách thấy và chọn lại */}
          {city && provinces.length > 0 && !isKnownProvince && <option value={city}>{city} (cũ)</option>}
        </Form.Select>
        {cityFeedback && <Form.Control.Feedback type="invalid">{cityFeedback}</Form.Control.Feedback>}
      </Form.Group>

      <Form.Group className="position-relative" ref={boxRef}>
        <Form.Control
          size={size}
          id={`${idPrefix}-ward`}
          aria-label="Phường/Xã"
          autoComplete="off"
          placeholder={wardPlaceholder}
          disabled={!city}
          value={ward || ''}
          isInvalid={wardInvalid}
          onFocus={() => setOpen(true)}
          onBlur={() => setTouchedWard(true)}
          onKeyDown={onKeyDown}
          onChange={(e) => {
            onChange({ ward: e.target.value });
            setOpen(true);
            setHighlight(0);
          }}
        />
        <Form.Control.Feedback type="invalid">Vui lòng chọn phường/xã trong danh sách gợi ý</Form.Control.Feedback>
        {open && city && isKnownProvince && (
          <ListGroup
            className="position-absolute w-100 shadow-sm mt-1 overflow-auto"
            style={{ zIndex: 1050, maxHeight: 240 }}
            role="listbox"
          >
            {loadingWards && (
              <ListGroup.Item className="small text-muted">
                <Spinner size="sm" className="me-2" /> Đang tải...
              </ListGroup.Item>
            )}
            {!loadingWards && suggestions.length === 0 && (
              <ListGroup.Item className="small text-muted">Không tìm thấy phường/xã phù hợp</ListGroup.Item>
            )}
            {!loadingWards &&
              suggestions.map((w, i) => (
                <ListGroup.Item
                  key={w._id}
                  action
                  role="option"
                  active={i === highlight}
                  className="small py-2"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(w.name)}
                >
                  {w.name}
                </ListGroup.Item>
              ))}
          </ListGroup>
        )}
      </Form.Group>
    </div>
  );
}
