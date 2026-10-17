import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, ProgressBar } from 'react-bootstrap';
import { Paperclip, EmojiSmile, X, Send } from 'react-bootstrap-icons';
import { chatService, formatChatFileSize } from '../services/chatService';
import ChatSticker, { stickers } from './ChatSticker';

const categories = [
  { label: 'Mặt cười', icon: '☺', items: [['😀','vui smile'],['😃','vui cười'],['😄','cười laugh'],['😁','cười grin'],['😆','cười laugh'],['😅','mồ hôi sweat'],['😂','cười laugh'],['🤣','cười laugh'],['😊','vui smile'],['😉','nháy mắt wink'],['😍','yêu love'],['😘','hôn kiss'],['🥰','yêu love'],['😋','ngon yummy'],['😜','đùa tongue'],['🤔','nghĩ think'],['😎','ngầu cool'],['🙂','vui smile'],['🙃','upside'],['😢','buồn sad'],['😭','khóc cry'],['😮','ngạc nhiên surprise'],['😡','giận angry'],['🥺','xin please'],['😴','ngủ sleep'],['😇','angel'],['🤗','ôm hug'],['🤩','thích star']] },
  { label: 'Cử chỉ & trái tim', icon: '♡', items: [['👍','đồng ý like ok'],['👎','không dislike'],['👌','ok'],['👏','vỗ tay clap'],['🙏','cảm ơn thanks'],['👋','chào hello bye'],['🤝','bắt tay handshake'],['💪','mạnh strong'],['❤️','tim love'],['💜','tim purple'],['💖','tim heart'],['💕','tim love'],['💯','tuyệt great'],['✅','đúng check'],['🎉','chúc mừng party'],['🔥','lửa fire']] },
  { label: 'Động vật & thiên nhiên', icon: '♧', items: [['🐶','chó dog'],['🐱','mèo cat'],['🐼','gấu panda'],['🐰','thỏ rabbit'],['🌸','hoa flower'],['🌻','hoa sunflower'],['🌈','cầu vồng rainbow'],['☀️','nắng sun'],['🌙','trăng moon'],['⭐','sao star']] },
  { label: 'Đồ ăn & đồ vật', icon: '♨', items: [['🍎','táo apple'],['🍕','pizza'],['☕','cà phê coffee'],['🍰','bánh cake'],['📱','điện thoại phone'],['💻','máy tính laptop'],['🎧','tai nghe headphone'],['🛒','mua shopping'],['📦','gói hàng package'],['🚚','giao hàng delivery'],['🎁','quà gift']] }
];
const fold = (text) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
function readRecent() { try { const items = JSON.parse(localStorage.getItem('techshop.chat.emojis') || '[]'); return Array.isArray(items) ? items.filter((v) => categories.some((c) => c.items.some(([e]) => e === v))).slice(0, 14) : []; } catch { return []; } }
function DraftFile({ entry, onRemove, disabled }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!entry.file.type.startsWith('image/')) return;
    const objectUrl = URL.createObjectURL(entry.file); setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [entry.file]);
  return <div className="d-flex align-items-center gap-2 border rounded p-1 small">
    {url && <img src={url} alt="Ảnh đính kèm" style={{ width: 38, height: 38, objectFit: 'cover' }} />}
    <span className="text-truncate flex-grow-1">{entry.file.name} <span className="text-muted">({formatChatFileSize(entry.file.size)})</span></span>
    <Button size="sm" variant="link" className="p-0" aria-label={`Bỏ tệp ${entry.file.name}`} onClick={onRemove} disabled={disabled}><X size={20} /></Button>
  </div>;
}

export default function ChatComposer({ conversationId, guest = false, disabled = false, onSend, onTyping, onBusyChange }) {
  const [content, setContent] = useState('');
  const [files, setFiles] = useState([]);
  const [stickerId, setStickerId] = useState('');
  const [picker, setPicker] = useState(false);
  const [tab, setTab] = useState('emoji');
  const [category, setCategory] = useState(0);
  const [search, setSearch] = useState('');
  const [recent, setRecent] = useState(readRecent);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState(null);
  const textarea = useRef(null);
  const selection = useRef({ start: 0, end: 0 });
  const fileInput = useRef(null);
  const lock = useRef(false);
  const pending = useRef(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; onBusyChange?.(false); }; }, [onBusyChange]);
  const locked = disabled || busy || failed;
  const chooseFiles = (event) => {
    const incoming = Array.from(event.target.files || []); event.target.value = '';
    if (files.length + incoming.length > 5) return setError('Mỗi tin nhắn tối đa 5 tệp.');
    if (incoming.some((f) => !['image/jpeg','image/png','image/webp','image/gif','application/pdf'].includes(f.type) || f.size > 5 * 1024 * 1024 || !f.size)) return setError('Chọn JPG, PNG, WEBP, GIF hoặc PDF, mỗi tệp tối đa 5 MB.');
    setFiles((prev) => [...prev, ...incoming.map((file) => ({ file, id: crypto.randomUUID() }))]); setError('');
  };
  const insertEmoji = (emoji) => {
    const { start, end } = selection.current;
    const next = content.slice(0, start) + emoji + content.slice(end);
    if (next.length > 2000) return;
    setContent(next); onTyping?.();
    const items = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, 14); setRecent(items);
    try { localStorage.setItem('techshop.chat.emojis', JSON.stringify(items)); } catch { /* storage may be disabled */ }
    const position = start + emoji.length; selection.current = { start: position, end: position };
    requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(position, position); });
  };
  const send = async (event) => {
    event.preventDefault();
    if (lock.current || disabled || (!content.trim() && !files.length && !stickerId)) return;
    lock.current = true; setBusy(true); onBusyChange?.(true); setError(''); setPicker(false);
    pending.current ||= { content: content.trim(), stickerId: stickerId || undefined, clientMessageId: crypto.randomUUID() };
    try {
      if (!pending.current.attachmentIds) {
        const attachments = files.length ? await chatService.upload(conversationId, files, guest, (e) => { if (alive.current) setProgress(e.total ? Math.round(e.loaded * 100 / e.total) : 0); }) : [];
        pending.current.attachmentIds = attachments.map((a) => a.attachmentId);
      }
      await onSend(pending.current);
      if (alive.current) { setContent(''); setFiles([]); setStickerId(''); setFailed(false); selection.current = { start: 0, end: 0 }; }
      pending.current = null;
    } catch (err) {
      if (alive.current) {
        if ([400, 413, 415].includes(err.response?.status)) {
          // Definitively rejected input can be edited; an uncertain network failure retains its send ID.
          pending.current = null; setFailed(false); setFiles((prev) => prev.map((entry) => ({ ...entry, id: crypto.randomUUID() })));
        } else setFailed(true);
        setError(err.response?.data?.message || 'Gửi thất bại. Bấm Gửi lại để thử lại với cùng mã tin nhắn.');
      }
    } finally { lock.current = false; if (alive.current) { setBusy(false); setProgress(null); onBusyChange?.(false); } }
  };
  const filteredCategories = search ? categories.map((c) => ({ ...c, items: c.items.filter(([e, label]) => fold(`${e} ${label}`).includes(fold(search))) })).filter((c) => c.items.length) : [categories[category]];
  return <Form onSubmit={send} className="position-relative">
    {error && <Alert variant="danger" className="small p-2 mb-2">{error}</Alert>}
    {failed && <Button size="sm" variant="link" disabled={busy || disabled} onClick={() => { pending.current = null; setFailed(false); setContent(''); setFiles([]); setStickerId(''); setError(''); }}>Xóa bản nháp</Button>}
    {(files.length > 0 || stickerId) && <div className="d-flex flex-column gap-1 mb-2" style={{ maxHeight: 140, overflowY: 'auto' }}>
      {files.map((entry) => <DraftFile key={entry.id} entry={entry} disabled={locked} onRemove={() => setFiles((prev) => prev.filter((f) => f.id !== entry.id))} />)}
      {stickerId && <div className="d-flex align-items-center"><ChatSticker id={stickerId} size={72} /><Button size="sm" variant="link" aria-label="Bỏ sticker" disabled={locked} onClick={() => setStickerId('')}><X size={20} /></Button><span className="small text-muted">Sticker sẽ gửi cùng tin nhắn</span></div>}
    </div>}
    {progress !== null && <ProgressBar now={progress} label={`Tải tệp ${progress}%`} className="mb-2" />}
    {picker && <div role="dialog" aria-label="Chọn emoji hoặc sticker" className="bg-white text-dark border rounded-3 shadow p-2 position-absolute"
      style={{ bottom: '100%', left: 0, width: 'min(330px, 100%)', zIndex: 5, marginBottom: 8 }}>
      <div className="d-flex gap-1 mb-2"><Button size="sm" variant={tab === 'emoji' ? 'primary' : 'light'} onClick={() => setTab('emoji')}>Emoji</Button><Button size="sm" variant={tab === 'sticker' ? 'primary' : 'light'} onClick={() => setTab('sticker')}>Sticker</Button><Button size="sm" variant="link" className="ms-auto p-0" aria-label="Đóng bảng emoji" onClick={() => setPicker(false)}><X size={22} /></Button></div>
      {tab === 'emoji' && <div className="d-flex gap-1 mb-2">{categories.map((c, i) => <Button key={c.label} size="sm" aria-label={c.label} title={c.label} variant={category === i ? 'outline-primary' : 'light'} onClick={() => { setCategory(i); setSearch(''); }}>{c.icon}</Button>)}</div>}
      <Form.Control size="sm" aria-label="Tìm emoji hoặc sticker" placeholder="Tìm kiếm…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-2" />
      <div style={{ maxHeight: 210, overflowY: 'auto' }}>
        {tab === 'emoji' ? <>
          {!search && recent.length > 0 && <><div className="small text-muted">Thường dùng</div><div className="d-flex flex-wrap">{recent.map((e) => <Button key={e} variant="link" className="p-1 text-decoration-none" style={{ fontSize: 25 }} aria-label={`Chèn ${e}`} onMouseDown={(event) => event.preventDefault()} onClick={() => insertEmoji(e)}>{e}</Button>)}</div></>}
          {filteredCategories.map((c) => <div key={c.label}><div className="small text-muted">{c.label}</div><div className="d-flex flex-wrap">{c.items.map(([e, label]) => <Button key={e} variant="link" className="p-1 text-decoration-none" style={{ fontSize: 25 }} title={label} aria-label={`Chèn ${e}`} onMouseDown={(event) => event.preventDefault()} onClick={() => insertEmoji(e)}>{e}</Button>)}</div></div>)}
          {!filteredCategories.length && <p className="small text-muted">Không tìm thấy emoji.</p>}
        </> : <div className="d-flex flex-wrap">{stickers.filter((s) => fold(s.label).includes(fold(search))).map((s) => <Button key={s.id} variant="link" className="p-0" aria-label={`Chọn sticker ${s.label}`} onClick={() => { setStickerId(s.id); setPicker(false); }}><ChatSticker id={s.id} size={88} /></Button>)}</div>}
      </div>
    </div>}
    <Form.Control as="textarea" ref={textarea} rows={2} maxLength={2000} size="sm" aria-label={guest ? 'Tin nhắn' : 'Phản hồi'} value={content} disabled={locked}
      onSelect={(e) => { selection.current = { start: e.target.selectionStart, end: e.target.selectionEnd }; }}
      onChange={(e) => { setContent(e.target.value); selection.current = { start: e.target.selectionStart, end: e.target.selectionEnd }; onTyping?.(); }} placeholder="Nhập tin nhắn…" />
    <div className="d-flex gap-1 align-items-center mt-1">
      <input ref={fileInput} type="file" multiple accept=".jpg,.jpeg,.png,.webp,.gif,.pdf" className="d-none" onChange={chooseFiles} aria-label="Chọn tệp chat" disabled={locked} />
      <Button type="button" size="sm" variant="link" aria-label="Đính kèm tệp" title="Tối đa 5 tệp, 5 MB/tệp" disabled={locked} onClick={() => fileInput.current?.click()}><Paperclip size={20} /></Button>
      <Button type="button" size="sm" variant="link" aria-label="Emoji và sticker" aria-expanded={picker} disabled={locked} onClick={() => setPicker((v) => !v)}><EmojiSmile size={20} /></Button>
      <Button type="submit" size="sm" className="ms-auto" disabled={busy || disabled || (!content.trim() && !files.length && !stickerId)}><Send className="me-1" />{busy ? 'Đang gửi…' : failed ? 'Gửi lại' : 'Gửi'}</Button>
    </div>
  </Form>;
}
