import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import { Star, StarFill } from 'react-bootstrap-icons';
import { chatService } from '../services/chatService';

export function RatingDetails({ conversation }) {
  const { rating, agentAtClose, closedBy } = conversation;
  return <div className="rounded border bg-light text-dark p-2 small">
    {rating ? <><div className="text-warning" aria-label={`${rating.stars} trên 5 sao`}>{'★'.repeat(rating.stars)}{'☆'.repeat(5 - rating.stars)} <span className="text-dark">{rating.stars}/5</span></div>
      {rating.comment && <div className="mt-1" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{rating.comment}</div>}
      <div className="text-muted mt-1">Đánh giá lúc {new Date(rating.submittedAt).toLocaleString('vi-VN')}</div></> : <div className="text-muted">Khách chưa đánh giá.</div>}
    {agentAtClose?.name && <div className="mt-1">Nhân viên phụ trách: {agentAtClose.name}</div>}
    {closedBy?.name && <div className="text-muted">Kết thúc bởi: {closedBy.name}</div>}
  </div>;
}
export default function ChatRating({ conversation, onRated, onBusyChange }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [later, setLater] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; onBusyChange?.(false); }; }, [onBusyChange]);
  const send = async (event) => {
    event.preventDefault(); if (!stars || lock.current) return;
    lock.current = true; setBusy(true); onBusyChange?.(true); setError('');
    try { onRated(await chatService.rate({ stars, comment: comment.trim() })); }
    catch (err) {
      if (err.response?.status === 409) { try { onRated((await chatService.session()).data); } catch { /* keep retry available */ } }
      if (alive.current) setError(err.response?.data?.message || 'Chưa gửi được đánh giá. Vui lòng thử lại.');
    } finally { lock.current = false; if (alive.current) { setBusy(false); onBusyChange?.(false); } }
  };
  if (conversation.rating) return <div><p className="small fw-semibold mb-2">Cảm ơn bạn đã đánh giá!</p><RatingDetails conversation={conversation} /></div>;
  if (later) return <Button size="sm" variant="link" onClick={() => setLater(false)}>Đánh giá cuộc trò chuyện</Button>;
  return <Form onSubmit={send} className="border rounded-3 p-2 bg-light text-dark">
    <div className="small fw-semibold">Bạn hài lòng với hỗ trợ của TechShop?</div>
    <div role="group" aria-label="Chọn mức độ hài lòng" className="d-flex my-1">{[1,2,3,4,5].map((value) => <Button type="button" key={value} variant="link" className="text-warning p-1" aria-label={`${value} sao`} aria-pressed={stars === value} disabled={busy} onClick={() => setStars(value)}>{value <= stars ? <StarFill size={26} /> : <Star size={26} />}</Button>)}</div>
    <Form.Control as="textarea" rows={2} maxLength={1000} size="sm" aria-label="Nhận xét đánh giá" placeholder="Nhận xét của bạn (không bắt buộc)" value={comment} disabled={busy} onChange={(e) => setComment(e.target.value)} />
    {error && <Alert variant="danger" className="small p-1 my-1">{error}</Alert>}
    <div className="d-flex gap-2 mt-2"><Button size="sm" type="submit" disabled={!stars || busy}>{busy ? 'Đang gửi…' : 'Gửi đánh giá'}</Button><Button size="sm" variant="link" disabled={busy} onClick={() => setLater(true)}>Để sau</Button></div>
  </Form>;
}
