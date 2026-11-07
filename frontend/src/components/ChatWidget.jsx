import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, Form, Spinner } from 'react-bootstrap';
import { ChatDotsFill, X } from 'react-bootstrap-icons';
import { useAuth } from '../store/AuthContext';
import { chatService, chatStatus, clearChatToken, createChatSocket, getChatToken, mergeMessages } from '../services/chatService';
import ChatMessages from './ChatMessages';
import ChatComposer from './ChatComposer';
import ChatRating from './ChatRating';

export default function ChatWidget() {
  const { user, loading: authLoading } = useAuth();
  const visible = !authLoading && (!user || user.role === 'customer');
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', phone: '', gender: '', content: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState(0);
  const [typing, setTyping] = useState('');
  const socketRef = useRef(null);
  const bottomRef = useRef(null);
  const openRef = useRef(open);
  const typingTimer = useRef(null);
  const sendLock = useRef(false);
  const skipScroll = useRef(false);
  const loadedOlder = useRef(false);
  const activeId = useRef(null);
  activeId.current = conversation?._id;
  openRef.current = open;

  useEffect(() => {
    if (!visible) return;
    setForm((prev) => ({ ...prev, name: user?.displayName || prev.name, email: user?.email || prev.email,
      phone: user?.phoneNumber || prev.phone, gender: ['male', 'female', 'other'].includes(user?.gender) ? user.gender : prev.gender }));
  }, [visible, user?._id]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        if (getChatToken()) {
          const result = await chatService.session();
          if (!cancelled) { setConversation(result.data); setOnline(result.onlineCount); }
        } else {
          const count = await chatService.availability();
          if (!cancelled) setOnline(count);
        }
      } catch (err) {
        if (err.response?.status === 401) clearChatToken();
        else if (!cancelled) setError('Không tải được phiên chat. Hãy thử lại khi kết nối ổn định.');
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [visible]);

  useEffect(() => {
    if (!visible || !conversation?._id) return;
    let cancelled = false;
    const id = conversation._id;
    loadedOlder.current = false;
    const sync = async () => {
      try {
        const [session, history] = await Promise.all([chatService.session(), chatService.guestHistory()]);
        if (cancelled || session.data._id !== id) return;
        setConversation(session.data); setOnline(session.onlineCount);
        setMessages((prev) => mergeMessages(prev, history.data));
        if (!loadedOlder.current) setHasMore(history.hasMore);
        if (openRef.current && document.visibilityState === 'visible') {
          await chatService.guestRead();
          if (!cancelled) setConversation((prev) => ({ ...prev, customerUnread: 0 }));
        }
      } catch (err) {
        if (cancelled) return;
        if (err.response?.status === 401) {
          clearChatToken(); setConversation(null); setMessages([]);
          setError('Phiên chat đã hết hạn. Vui lòng điền thông tin để bắt đầu lại.');
        } else setError(err.response?.data?.message || 'Chưa đồng bộ được tin nhắn');
      }
    };
    const socket = createChatSocket(true);
    socketRef.current = socket;
    socket.on('connect', () => { setConnected(true); sync(); });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.on('chat:conversation', (data) => { if (data._id === id) setConversation(data); });
    socket.on('chat:message', (message) => {
      if (message.conversationId !== id) return;
      setMessages((prev) => mergeMessages(prev, [message]));
      setTyping('');
      if (openRef.current && document.visibilityState === 'visible') chatService.guestRead().then(() => {
        if (!cancelled) setConversation((prev) => ({ ...prev, customerUnread: 0 }));
      }).catch(() => {});
    });
    socket.on('chat:typing', (data) => {
      if (data.conversationId !== id) return;
      setTyping(`${data.name} đang nhập…`);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping(''), 2500);
    });
    socket.connect(); sync();
    const interval = setInterval(sync, 15000);
    return () => { cancelled = true; clearInterval(interval); clearTimeout(typingTimer.current); socket.disconnect(); socketRef.current = null; };
  }, [visible, conversation?._id]);

  useEffect(() => {
    if (open && !skipScroll.current) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    skipScroll.current = false;
    if (open && conversation?._id && document.visibilityState === 'visible') {
      chatService.guestRead().then(() => setConversation((prev) => prev ? { ...prev, customerUnread: 0 } : prev)).catch(() => {});
    }
  }, [open, messages.length, conversation?.status, conversation?.rating?.submittedAt]);

  const start = async (event) => {
    event.preventDefault();
    if (sendLock.current) return;
    sendLock.current = true; setBusy(true); setError(''); setFieldErrors({});
    try { const result = await chatService.start(form); setMessages([]); setConversation(result.data); setOnline(result.onlineCount); }
    catch (err) { setError(err.response?.data?.message || 'Không bắt đầu được chat. Vui lòng thử lại.'); setFieldErrors(err.response?.data?.errors || {}); }
    finally { sendLock.current = false; setBusy(false); }
  };
  const send = async (payload) => {
    const message = await chatService.guestSend(payload);
    if (message.conversationId === activeId.current) setMessages((prev) => mergeMessages(prev, [message]));
  };
  const older = async () => {
    setBusy(true);
    try { const result = await chatService.guestHistory(messages[0]?._id); loadedOlder.current = true; skipScroll.current = true; setMessages((prev) => mergeMessages(prev, result.data)); setHasMore(result.hasMore); }
    catch { setError('Không tải được tin nhắn cũ'); } finally { setBusy(false); }
  };
  const newChat = () => {
    clearChatToken(); setConversation(null); setMessages([]); setHasMore(false); setError('');
    setForm((prev) => ({ ...prev, content: '' }));
  };

  if (!visible) return null;
  return <div className="position-fixed d-flex flex-column align-items-end" style={{ bottom: '1rem', right: '1rem', zIndex: 1040 }}>
    {open && <Card className="shadow-lg mb-3 border-0" role="region" aria-label="Chat với nhân viên"
      style={{ width: 'min(360px, calc(100vw - 2rem))', height: 'min(580px, calc(100dvh - 6.5rem))' }}>
      <Card.Header className="bg-primary text-white d-flex align-items-center justify-content-between">
        <div><div className="fw-semibold">Chat với nhân viên</div><div className="small opacity-75">TechShop · Chăm sóc khách hàng</div></div>
        <Button variant="link" className="text-white p-0" aria-label="Thu nhỏ chat" onClick={() => setOpen(false)}><X size={24} /></Button>
      </Card.Header>
      {error && <Alert variant="danger" className="m-2 p-2 small" dismissible onClose={() => setError('')}>{error}</Alert>}
      {loading ? <Card.Body className="text-center"><Spinner size="sm" /> Đang tải…</Card.Body> : !conversation ?
        <Card.Body className="overflow-auto">
          <p className="small text-muted">Điền thông tin để nhân viên hỗ trợ bạn. Không cần đăng nhập.</p>
          <Form onSubmit={start}>
            {[['name', 'Tên (*)', 'text'], ['email', 'Email', 'email'], ['phone', 'Số điện thoại (*)', 'tel']].map(([key, label, type]) =>
              <Form.Group className="mb-2" controlId={`chat-${key}`} key={key}>
                <Form.Label className="small mb-1">{label}</Form.Label>
                <Form.Control size="sm" type={type} required={key !== 'email'} disabled={busy} value={form[key]}
                  maxLength={key === 'name' ? 80 : key === 'email' ? 254 : 20} autoComplete={key === 'phone' ? 'tel' : key}
                  isInvalid={!!fieldErrors[key]} onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))} />
                <Form.Control.Feedback type="invalid">{fieldErrors[key]}</Form.Control.Feedback>
              </Form.Group>)}
            <Form.Group className="mb-2" controlId="chat-gender"><Form.Label className="small mb-1">Giới tính</Form.Label>
              <Form.Select size="sm" value={form.gender} disabled={busy} onChange={(e) => setForm((prev) => ({ ...prev, gender: e.target.value }))}>
                <option value="">Không cung cấp</option><option value="male">Nam</option><option value="female">Nữ</option><option value="other">Khác</option>
              </Form.Select></Form.Group>
            <Form.Group className="mb-3" controlId="chat-content"><Form.Label className="small mb-1">Nội dung tin nhắn</Form.Label>
              <Form.Control as="textarea" rows={3} maxLength={2000} disabled={busy} value={form.content} isInvalid={!!fieldErrors.content}
                onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))} placeholder="Bạn cần hỗ trợ gì?" />
              <Form.Control.Feedback type="invalid">{fieldErrors.content}</Form.Control.Feedback>
            </Form.Group>
            {online === 0 && <p className="small text-muted">Hiện chưa có nhân viên trực. Bạn vẫn có thể để lại tin nhắn.</p>}
            <Button type="submit" className="w-100" disabled={busy}>{busy ? 'Đang bắt đầu…' : 'Bắt đầu chat'}</Button>
          </Form>
        </Card.Body> : <>
          <div className="border-bottom px-3 py-2 small">
            <Badge bg={conversation.status === 'active' ? 'success' : 'secondary'}>{chatStatus[conversation.status]}</Badge>
            {conversation.assignedTo && <div className="mt-1">Nhân viên: <strong>{conversation.assignedTo.name}</strong></div>}
            {conversation.status === 'waiting' && <div className="text-muted mt-1">{online > 0 ? 'Đang chờ nhân viên tiếp nhận.' : 'Hiện chưa có nhân viên trực. Tin nhắn của bạn đã được lưu.'}</div>}
            {!connected && conversation.status !== 'closed' && <div className="text-warning mt-1">Đang kết nối lại… Tin nhắn sẽ được đồng bộ.</div>}
          </div>
          <Card.Body className="d-flex flex-column gap-2 overflow-auto" aria-live="polite">
            {hasMore && <Button size="sm" variant="link" disabled={busy} onClick={older}>Xem tin nhắn cũ</Button>}
            {messages.length === 0 && <p className="small text-muted text-center">Hãy gửi tin nhắn để nhân viên hỗ trợ bạn.</p>}
            <ChatMessages messages={messages} customer />
            {conversation.status === 'closed' && <ChatRating key={conversation._id} conversation={conversation} onBusyChange={setBusy}
              onRated={(data) => { if (data._id === activeId.current) setConversation(data); }} />}
            <div ref={bottomRef} />
          </Card.Body>
          <div className="px-3 small text-muted" style={{ minHeight: 22 }}>{typing}</div>
          <Card.Footer className="p-2">
            {conversation.status === 'closed' ? <div className="text-center small"><p className="mb-2">Cuộc chat đã kết thúc.</p><Button size="sm" disabled={busy} onClick={newChat}>Bắt đầu cuộc chat mới</Button></div> :
              <ChatComposer key={conversation._id} conversationId={conversation._id} guest disabled={busy} onBusyChange={setBusy}
                onSend={send} onTyping={() => socketRef.current?.emit('chat:typing', { conversationId: conversation._id })} />}
          </Card.Footer>
        </>}
    </Card>}
    <Button onClick={() => setOpen((prev) => !prev)} className="rounded-circle shadow position-relative" aria-label={open ? 'Thu nhỏ chat' : 'Chat với nhân viên'} aria-expanded={open}
      style={{ width: 56, height: 56 }}>
      {open ? <X size={26} /> : <ChatDotsFill size={24} />}
      {!open && conversation?.customerUnread > 0 && <Badge pill bg="danger" className="position-absolute top-0 start-100 translate-middle">{conversation.customerUnread}</Badge>}
    </Button>
  </div>;
}
