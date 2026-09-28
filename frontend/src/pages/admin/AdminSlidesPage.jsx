import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, Col, Form, InputGroup, Modal, Row, Spinner } from 'react-bootstrap';
import { ArrowDown, ArrowUp, EyeFill, EyeSlashFill, PencilSquare, Plus, Trash, Upload } from 'react-bootstrap-icons';
import { slideService } from '../../services/slideService';
import { uploadService } from '../../services/uploadService';
import HeroSlide from '../../components/HeroSlide';

const EMPTY = {
  eyebrow: '',
  title: '',
  subtitle: '',
  buttonText: 'Xem ngay',
  buttonLink: '/products',
  bgType: 'theme',
  colorFrom: '#dc2626',
  colorTo: '#f97316',
  imageUrl: '',
  darkOverlay: true,
  textColor: 'light',
  isActive: true,
  startAt: '',
  endAt: ''
};
const BG_TYPES = [
  { value: 'theme', label: 'Theo màu giao diện' },
  { value: 'gradient', label: 'Dải màu tự chọn' },
  { value: 'image', label: 'Ảnh nền' }
];

// Date -> giá trị ô datetime-local (giờ địa phương)
const toLocalInput = (d) => {
  if (!d) return '';
  const date = new Date(d);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

// Trạng thái hiển thị thực tế của slide
function statusOf(s, now = Date.now()) {
  if (!s.isActive) return { bg: 'secondary', text: 'Đang tắt' };
  if (s.startAt && new Date(s.startAt) > now) return { bg: 'info', text: `Hiện từ ${new Date(s.startAt).toLocaleString('vi-VN')}` };
  if (s.endAt && new Date(s.endAt) < now) return { bg: 'warning', text: 'Đã hết thời gian hiển thị' };
  return { bg: 'success', text: 'Đang hiển thị' };
}

// Quản lý slide (banner lớn) ở đầu trang chủ
export default function AdminSlidesPage() {
  const [slides, setSlides] = useState(null);
  const [editing, setEditing] = useState(null); // { id?, form }
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState(null);
  const [formError, setFormError] = useState('');
  const fileRef = useRef(null);

  const load = useCallback(() => slideService.getAll().then(setSlides), []);
  useEffect(() => {
    load().catch((err) => setNotice({ variant: 'danger', text: err.response?.data?.message || 'Không tải được danh sách slide' }));
  }, [load]);

  const show = (variant, text) => setNotice({ variant, text });
  const fail = (err, fallback) => show('danger', err.response?.data?.message || fallback);

  const openNew = () => {
    setFormError('');
    setEditing({ form: { ...EMPTY } });
  };
  const openEdit = (s) => {
    setFormError('');
    setEditing({ id: s._id, form: { ...EMPTY, ...s, startAt: toLocalInput(s.startAt), endAt: toLocalInput(s.endAt) } });
  };
  const setField = (k, v) => setEditing((e) => ({ ...e, form: { ...e.form, [k]: v } }));

  const save = async (e) => {
    e.preventDefault();
    const { form, id } = editing;
    const payload = {
      eyebrow: form.eyebrow,
      title: form.title,
      subtitle: form.subtitle,
      buttonText: form.buttonText,
      buttonLink: form.buttonLink,
      bgType: form.bgType,
      colorFrom: form.colorFrom,
      colorTo: form.colorTo,
      imageUrl: form.imageUrl,
      darkOverlay: form.darkOverlay,
      textColor: form.textColor,
      isActive: form.isActive,
      startAt: form.startAt ? new Date(form.startAt).toISOString() : null,
      endAt: form.endAt ? new Date(form.endAt).toISOString() : null
    };
    setBusy(true);
    setFormError('');
    try {
      const res = id ? await slideService.update(id, payload) : await slideService.create(payload);
      setEditing(null);
      show('success', res.message);
      await load();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Lưu thất bại');
    } finally {
      setBusy(false);
    }
  };

  const uploadImage = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    setFormError('');
    try {
      const [url] = await uploadService.uploadImages([files[0]]);
      setEditing((e) => ({ ...e, form: { ...e.form, imageUrl: url, bgType: 'image' } }));
    } catch (err) {
      setFormError(err.response?.data?.message || 'Tải ảnh thất bại');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const toggle = async (s) => {
    try {
      await slideService.update(s._id, { isActive: !s.isActive });
      await load();
    } catch (err) {
      fail(err, 'Cập nhật thất bại');
    }
  };
  const remove = async (s) => {
    if (!confirm(`Xóa slide "${s.title}"?`)) return;
    try {
      show('success', (await slideService.remove(s._id)).message);
      await load();
    } catch (err) {
      fail(err, 'Xóa thất bại');
    }
  };
  const move = async (index, dir) => {
    const ids = slides.map((s) => s._id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    setSlides((cur) => ids.map((id) => cur.find((s) => s._id === id))); // đổi ngay trên giao diện
    try {
      await slideService.reorder(ids);
    } catch (err) {
      fail(err, 'Lưu thứ tự thất bại');
      load();
    }
  };

  const visibleCount = (slides || []).filter((s) => statusOf(s).bg === 'success').length;
  const f = editing?.form;

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
        <h1 className="fs-4 fw-bold mb-0">Slide trang chủ</h1>
        <Button size="sm" onClick={openNew}>
          <Plus /> Thêm slide
        </Button>
      </div>
      <p className="small text-muted mb-3">
        Banner lớn chạy tự động ở đầu trang chủ. Sắp xếp bằng nút mũi tên; slide tắt hoặc ngoài thời gian hiển thị sẽ không hiện
        cho khách. {slides && <>Đang hiển thị <strong>{visibleCount}</strong>/{slides.length} slide.</>}
      </p>
      {notice && (
        <Alert variant={notice.variant} dismissible onClose={() => setNotice(null)} className="py-2 small">
          {notice.text}
        </Alert>
      )}

      {!slides ? (
        <div className="text-center py-5">
          <Spinner animation="border" size="sm" />
        </div>
      ) : slides.length === 0 ? (
        <Card body className="text-center text-muted small">
          Chưa có slide nào - trang chủ đang ẩn khối slide. Bấm <strong>Thêm slide</strong> để tạo.
        </Card>
      ) : (
        <div className="d-flex flex-column gap-3">
          {slides.map((s, i) => {
            const st = statusOf(s);
            return (
              <Card key={s._id} className="shadow-sm border-0" data-slide-title={s.title}>
                <Row className="g-0 align-items-stretch">
                  <Col md={7} className="overflow-hidden rounded-start" style={{ opacity: st.bg === 'success' ? 1 : 0.55 }}>
                    <HeroSlide slide={s} preview />
                  </Col>
                  <Col md={5}>
                    <Card.Body className="h-100 d-flex flex-column gap-2">
                      <div className="d-flex justify-content-between align-items-start gap-2">
                        <div>
                          <div className="small text-muted">#{i + 1}</div>
                          <div className="fw-medium">{s.title}</div>
                        </div>
                        <Badge bg={st.bg}>{st.text}</Badge>
                      </div>
                      <div className="small text-muted">
                        Nút: {s.buttonText ? `"${s.buttonText}" → ${s.buttonLink}` : 'không có'}
                        {s.endAt && <div>Hiển thị đến: {new Date(s.endAt).toLocaleString('vi-VN')}</div>}
                      </div>
                      <div className="d-flex flex-wrap gap-1 mt-auto">
                        <Button size="sm" variant="outline-secondary" title="Lên" disabled={i === 0} onClick={() => move(i, -1)}>
                          <ArrowUp />
                        </Button>
                        <Button size="sm" variant="outline-secondary" title="Xuống" disabled={i === slides.length - 1} onClick={() => move(i, 1)}>
                          <ArrowDown />
                        </Button>
                        <Button size="sm" variant="outline-secondary" onClick={() => toggle(s)}>
                          {s.isActive ? (
                            <>
                              <EyeSlashFill className="me-1" />
                              Tắt
                            </>
                          ) : (
                            <>
                              <EyeFill className="me-1" />
                              Bật
                            </>
                          )}
                        </Button>
                        <Button size="sm" variant="outline-primary" onClick={() => openEdit(s)}>
                          <PencilSquare className="me-1" />
                          Sửa
                        </Button>
                        <Button size="sm" variant="outline-danger" onClick={() => remove(s)}>
                          <Trash />
                        </Button>
                      </div>
                    </Card.Body>
                  </Col>
                </Row>
              </Card>
            );
          })}
        </div>
      )}

      <Modal show={!!editing} onHide={() => !busy && setEditing(null)} size="xl" centered>
        {f && (
          <Form onSubmit={save}>
            <Modal.Header closeButton>
              <Modal.Title className="fs-6">{editing.id ? 'Sửa slide' : 'Thêm slide'}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Row className="g-4">
                <Col lg={5}>
                  <Form.Group className="mb-2">
                    <Form.Label className="small fw-medium" htmlFor="slide-eyebrow">
                      Nhãn nhỏ (tùy chọn)
                    </Form.Label>
                    <Form.Control id="slide-eyebrow" size="sm" maxLength={80} placeholder="VD: ⚡ Ưu đãi mỗi ngày" value={f.eyebrow} onChange={(e) => setField('eyebrow', e.target.value)} />
                  </Form.Group>
                  <Form.Group className="mb-2">
                    <Form.Label className="small fw-medium" htmlFor="slide-title">
                      Tiêu đề *
                    </Form.Label>
                    <Form.Control id="slide-title" size="sm" required maxLength={120} value={f.title} onChange={(e) => setField('title', e.target.value)} />
                  </Form.Group>
                  <Form.Group className="mb-2">
                    <Form.Label className="small fw-medium" htmlFor="slide-subtitle">
                      Mô tả
                    </Form.Label>
                    <Form.Control id="slide-subtitle" as="textarea" rows={2} size="sm" maxLength={300} value={f.subtitle} onChange={(e) => setField('subtitle', e.target.value)} />
                  </Form.Group>
                  <Row className="g-2 mb-2">
                    <Col xs={5}>
                      <Form.Label className="small fw-medium" htmlFor="slide-btn-text">
                        Chữ trên nút
                      </Form.Label>
                      <Form.Control id="slide-btn-text" size="sm" maxLength={40} placeholder="Để trống = không có nút" value={f.buttonText} onChange={(e) => setField('buttonText', e.target.value)} />
                    </Col>
                    <Col xs={7}>
                      <Form.Label className="small fw-medium" htmlFor="slide-btn-link">
                        Đường dẫn nút
                      </Form.Label>
                      <Form.Control id="slide-btn-link" size="sm" placeholder="/promotions hoặc https://..." value={f.buttonLink} onChange={(e) => setField('buttonLink', e.target.value.trim())} />
                    </Col>
                  </Row>

                  <Form.Label className="small fw-medium mb-1">Nền</Form.Label>
                  <div className="d-flex flex-wrap gap-3 mb-2">
                    {BG_TYPES.map((b) => (
                      <Form.Check key={b.value} type="radio" id={`slide-bg-${b.value}`} name="slideBg" label={<span className="small">{b.label}</span>} checked={f.bgType === b.value} onChange={() => setField('bgType', b.value)} />
                    ))}
                  </div>
                  {f.bgType === 'gradient' && (
                    <div className="d-flex gap-3 mb-2 small align-items-center">
                      <span>Từ</span>
                      <Form.Control type="color" size="sm" value={f.colorFrom} onChange={(e) => setField('colorFrom', e.target.value)} style={{ width: 48 }} />
                      <span>đến</span>
                      <Form.Control type="color" size="sm" value={f.colorTo} onChange={(e) => setField('colorTo', e.target.value)} style={{ width: 48 }} />
                    </div>
                  )}
                  {f.bgType === 'image' && (
                    <div className="mb-2">
                      <InputGroup size="sm">
                        <Form.Control id="slide-image" placeholder="Link ảnh (https://...) hoặc bấm Tải ảnh" value={f.imageUrl} onChange={(e) => setField('imageUrl', e.target.value.trim())} />
                        <Button variant="outline-secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>
                          {uploading ? <Spinner size="sm" /> : <Upload className="me-1" />}
                          Tải ảnh
                        </Button>
                      </InputGroup>
                      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => uploadImage(e.target.files)} />
                      <Form.Text className="text-muted">Nên dùng ảnh ngang khoảng 1600×500px, tối đa 5MB.</Form.Text>
                      <Form.Check type="switch" id="slide-overlay" className="small mt-1" label="Phủ lớp tối để chữ dễ đọc" checked={f.darkOverlay} onChange={(e) => setField('darkOverlay', e.target.checked)} />
                    </div>
                  )}
                  <Form.Group className="mb-2">
                    <Form.Label className="small fw-medium mb-1">Màu chữ</Form.Label>
                    <div className="d-flex gap-3">
                      <Form.Check type="radio" id="slide-text-light" name="slideText" label={<span className="small">Trắng</span>} checked={f.textColor === 'light'} onChange={() => setField('textColor', 'light')} />
                      <Form.Check type="radio" id="slide-text-dark" name="slideText" label={<span className="small">Đen</span>} checked={f.textColor === 'dark'} onChange={() => setField('textColor', 'dark')} />
                    </div>
                  </Form.Group>
                  <Row className="g-2 mb-2">
                    <Col xs={6}>
                      <Form.Label className="small fw-medium" htmlFor="slide-start">
                        Hiện từ (tùy chọn)
                      </Form.Label>
                      <Form.Control id="slide-start" type="datetime-local" size="sm" value={f.startAt} onChange={(e) => setField('startAt', e.target.value)} />
                    </Col>
                    <Col xs={6}>
                      <Form.Label className="small fw-medium" htmlFor="slide-end">
                        Hiện đến (tùy chọn)
                      </Form.Label>
                      <Form.Control id="slide-end" type="datetime-local" size="sm" value={f.endAt} onChange={(e) => setField('endAt', e.target.value)} />
                    </Col>
                  </Row>
                  <Form.Check type="switch" id="slide-active" label={<span className="small">Đang bật</span>} checked={f.isActive} onChange={(e) => setField('isActive', e.target.checked)} />
                </Col>
                <Col lg={7}>
                  <div className="small fw-medium mb-2">Xem trước</div>
                  <div className="rounded-4 overflow-hidden shadow-sm">
                    <HeroSlide slide={f} />
                  </div>
                  {formError && (
                    <Alert variant="danger" className="small py-2 mt-3 mb-0">
                      {formError}
                    </Alert>
                  )}
                </Col>
              </Row>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" disabled={busy} onClick={() => setEditing(null)}>
                Hủy
              </Button>
              <Button type="submit" disabled={busy || uploading}>
                {busy ? 'Đang lưu...' : 'Lưu slide'}
              </Button>
            </Modal.Footer>
          </Form>
        )}
      </Modal>
    </div>
  );
}
