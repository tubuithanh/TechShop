<<<<<<< HEAD
import { useEffect, useRef, useState } from 'react';
import { Container, Row, Col, Form, Button, ListGroup } from 'react-bootstrap';
import { useAuth } from '../../store/AuthContext';
import { connectSocket } from '../../services/socket';
import { chatService } from '../../services/chatService';
=======
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Col, Container, Form, ListGroup, Nav, Row, Spinner } from 'react-bootstrap';
import { useAuth } from '../../store/AuthContext';
import { getAccessToken } from '../../services/api';
import { chatService, chatStatus, createChatSocket, mergeMessages } from '../../services/chatService';
import ChatMessages from '../../components/ChatMessages';
import ChatComposer from '../../components/ChatComposer';
import { RatingDetails } from '../../components/ChatRating';
>>>>>>> e846496448bebd851c1c76c93074f72922d069ac

export default function AdminChatPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState('waiting');
  const [page, setPage] = useState(1);
  const [list, setList] = useState({ data: [], counts: {}, total: 0, agents: [] });
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [filters, setFilters] = useState({ stars: '', agent: '', from: '', to: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [accepting, setAccepting] = useState(true);
  const [typing, setTyping] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [notice, setNotice] = useState('');
  const activeRef = useRef(null);
  const socketRef = useRef(null);
  const bottomRef = useRef(null);
  const listSequence = useRef(0);
  const historySequence = useRef(0);
  const typingTimer = useRef(null);
  const acceptingRef = useRef(accepting);
  const sendLock = useRef(false);
  const skipScroll = useRef(false);
  const loadedOlder = useRef(false);
  acceptingRef.current = accepting;
  const isAdmin = user.role === 'admin';
  useEffect(() => { activeRef.current = conversation?._id || null; }, [conversation?._id]);

  const loadList = useCallback(async () => {
    const sequence = ++listSequence.current;
    try {
      const result = await chatService.getConversations(status, page, status === 'closed' ? {
        stars: filters.stars, agent: filters.agent,
        from: filters.from ? new Date(filters.from + 'T00:00:00').toISOString() : undefined,
        to: filters.to ? new Date(filters.to + 'T23:59:59.999').toISOString() : undefined
      } : {});
      if (sequence === listSequence.current) setList(result);
    } catch (err) { if (sequence === listSequence.current) setError(err.response?.data?.message || 'Không tải được danh sách chat'); }
    finally { if (sequence === listSequence.current) setLoading(false); }
  }, [status, page, filters]);
  const loadListRef = useRef(loadList);
  loadListRef.current = loadList;

  const syncActive = async () => {
    const id = activeRef.current;
    if (!id) return;
    const sequence = ++historySequence.current;
    try {
      const result = await chatService.getHistory(id);
      if (activeRef.current !== id || sequence !== historySequence.current) return;
      setMessages((prev) => mergeMessages(prev, result.data));
      if (!loadedOlder.current) setHasMore(result.hasMore);
      if (document.visibilityState === 'visible') {
        const data = await chatService.read(id);
        if (activeRef.current === id) {
          setConversation(data);
          setList((prev) => ({ ...prev, data: prev.data.map((c) => c._id === id ? { ...c, staffUnread: data.staffUnread } : c) }));
        }
      }
    } catch (err) {
      if (activeRef.current !== id || sequence !== historySequence.current) return;
      setError(err.response?.data?.message || 'Không tải được hội thoại');
      if ([403, 404].includes(err.response?.status)) { activeRef.current = null; setConversation(null); setMessages([]); }
    }
  };
  const syncActiveRef = useRef(syncActive);
  syncActiveRef.current = syncActive;

  useEffect(() => { setLoading(true); loadList(); return () => { listSequence.current++; }; }, [loadList]);

  useEffect(() => {
<<<<<<< HEAD
    chatService.getConversations().then(setConversations);

    const socket = connectSocket();
=======
    let cancelled = false;
    const socket = createChatSocket();
>>>>>>> e846496448bebd851c1c76c93074f72922d069ac
    socketRef.current = socket;
    const announceAvailability = () => socket.emit('chat:availability', acceptingRef.current, (result) => {
      if (result?.error && !cancelled) setError(result.error);
    });
    socket.on('connect', () => { setConnected(true); announceAvailability(); loadListRef.current(); syncActiveRef.current(); });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    let refreshTimer;
    socket.on('chat:changed', ({ conversationId }) => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { loadListRef.current(); syncActiveRef.current(); }, 150);
      if (conversationId !== activeRef.current) setNotice('Danh sách chat vừa có cập nhật.');
    });
    socket.on('chat:conversation', (data) => {
      if (data._id === activeRef.current) setConversation(data);
    });
    socket.on('chat:message', (message) => {
      if (message.conversationId !== activeRef.current) return;
      setMessages((prev) => mergeMessages(prev, [message])); setTyping('');
    });
    socket.on('chat:typing', (data) => {
      if (data.conversationId !== activeRef.current) return;
      setTyping(`${data.name} đang nhập…`);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping(''), 2500);
    });
    socket.connect();
    // Polling recovers messages if a proxy or temporary network failure interrupts the socket.
    const interval = setInterval(async () => {
      await loadListRef.current();
      if (cancelled) return;
      const token = getAccessToken();
      if (token && socket.auth.token !== token) {
        socket.auth = { token, support: true }; socket.disconnect(); socket.connect();
      } else if (!socket.connected && token) socket.connect();
      else if (socket.connected) announceAvailability();
      syncActiveRef.current();
    }, 15000);
    return () => { cancelled = true; clearInterval(interval); clearTimeout(refreshTimer); clearTimeout(typingTimer.current);
      listSequence.current++; historySequence.current++; activeRef.current = null; socket.disconnect(); socketRef.current = null; };
  }, []);

  useEffect(() => { if (connected) socketRef.current?.emit('chat:availability', accepting); }, [accepting, connected]);
  useEffect(() => {
    if (!skipScroll.current) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    skipScroll.current = false;
  }, [messages.length, conversation?.status, conversation?.rating?.submittedAt]);

  const openConversation = async (data) => {
    if (busy) return;
    activeRef.current = data._id; historySequence.current++; loadedOlder.current = false;
    setConversation(data); setMessages([]); setHasMore(false); setTyping(''); setError(''); setTransferTo('');
    await syncActiveRef.current();
  };
  const act = async (action) => {
    if (!conversation || sendLock.current) return;
    const id = conversation._id;
    sendLock.current = true; setBusy(true); setError('');
    try {
      const data = action === 'claim' ? await chatService.claim(id) : await chatService.update(id, action, transferTo);
      if (activeRef.current === id) setConversation(data);
      if (action === 'claim') { setStatus('active'); setPage(1); await syncActiveRef.current(); }
      else if (action === 'close') { setStatus('closed'); setPage(1); }
      else if (action === 'release') { setStatus('waiting'); setPage(1); }
      if (action === 'transfer' && !isAdmin) { activeRef.current = null; setConversation(null); }
      await loadListRef.current();
    } catch (err) { setError(err.response?.data?.message || 'Không thực hiện được thao tác'); await loadListRef.current(); await syncActiveRef.current(); }
    finally { sendLock.current = false; setBusy(false); }
  };
  const send = async (payload) => {
    const id = activeRef.current;
    const message = await chatService.send(id, payload);
    if (activeRef.current === id) setMessages((prev) => mergeMessages(prev, [message]));
    await loadListRef.current();
  };
  const older = async () => {
    const id = activeRef.current;
    setBusy(true);
    try { const result = await chatService.getHistory(id, messages[0]?._id);
      if (activeRef.current === id) { loadedOlder.current = true; skipScroll.current = true; setMessages((prev) => mergeMessages(prev, result.data)); setHasMore(result.hasMore); }
    } catch { setError('Không tải được tin nhắn cũ'); } finally { setBusy(false); }
  };
  const canReply = conversation?.status === 'active' && (isAdmin || conversation.assignedTo?._id === user._id);
  const changeFilter = (key, value) => { setFilters((prev) => ({ ...prev, [key]: value })); setPage(1); };
  const genderLabels = { male: 'Nam', female: 'Nữ', other: 'Khác' };

  return <Container fluid>
    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <h1 className="fs-4 fw-bold mb-0">Chat với khách hàng</h1>
      <div className="d-flex align-items-center gap-3"><Badge bg={connected ? 'success' : 'secondary'}>{connected ? 'Đã kết nối' : 'Đang kết nối lại'}</Badge>
        <Form.Check type="switch" id="chat-accepting" label="Đang trực · Nhận chat" checked={accepting} onChange={(e) => setAccepting(e.target.checked)} /></div>
    </div>
    {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
    {notice && <Alert variant="info" className="py-2 small" dismissible onClose={() => setNotice('')}>{notice}</Alert>}
    <Nav variant="tabs" activeKey={status} className="mb-3" onSelect={(key) => { if (!busy) { setStatus(key); setPage(1); } }}>
      {Object.entries(chatStatus).map(([key, label]) => <Nav.Item key={key}><Nav.Link eventKey={key}>{label} <Badge bg="secondary">{list.counts[key] || 0}</Badge></Nav.Link></Nav.Item>)}
    </Nav>
    {status === 'closed' && <div className="border rounded p-2 mb-3 bg-white">
      <div className="d-flex flex-wrap gap-2 align-items-center">
        <Form.Select size="sm" aria-label="Lọc số sao" style={{ width: 155 }} value={filters.stars} onChange={(e) => changeFilter('stars', e.target.value)}>
          <option value="">Tất cả đánh giá</option>{[5,4,3,2,1].map((n) => <option key={n} value={n}>{n} sao</option>)}<option value="unrated">Chưa đánh giá</option>
        </Form.Select>
        {isAdmin && <Form.Select size="sm" aria-label="Lọc nhân viên" style={{ width: 200 }} value={filters.agent} onChange={(e) => changeFilter('agent', e.target.value)}>
          <option value="">Tất cả nhân viên</option>{(list.ratingAgents || []).map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
        </Form.Select>}
        <label className="small">Từ ngày <Form.Control size="sm" type="date" aria-label="Từ ngày kết thúc" value={filters.from} max={filters.to || undefined} onChange={(e) => changeFilter('from', e.target.value)} /></label>
        <label className="small">Đến ngày <Form.Control size="sm" type="date" aria-label="Đến ngày kết thúc" value={filters.to} min={filters.from || undefined} onChange={(e) => changeFilter('to', e.target.value)} /></label>
        <Button size="sm" variant="link" onClick={() => { setFilters({ stars: '', agent: '', from: '', to: '' }); setPage(1); }}>Xóa lọc</Button>
      </div>
      <div className="small text-muted mt-2">Mức hài lòng trung bình: <strong className="text-dark">{list.ratingSummary?.count ? list.ratingSummary.average.toFixed(1) + '/5 ★' : 'Chưa có đánh giá'}</strong> · {list.ratingSummary?.count || 0} đánh giá theo bộ lọc</div>
    </div>}
    <Row className="bg-white rounded-3 shadow-sm g-0" style={{ minHeight: 580 }}>
      <Col xs={12} lg={4} className="border-end d-flex flex-column" style={{ maxHeight: 650 }}>
        <div className="flex-grow-1 overflow-auto">
          {loading && <div className="p-3"><Spinner size="sm" /> Đang tải…</div>}
          <ListGroup variant="flush">
            {list.data.map((c) => <ListGroup.Item key={c._id} action active={conversation?._id === c._id} disabled={busy}
              onClick={() => openConversation(c)} className="py-3">
              <div className="d-flex justify-content-between gap-2"><strong className="text-truncate">{c.customer.name}</strong>
                {c.staffUnread > 0 && <Badge pill bg="danger">{c.staffUnread}</Badge>}</div>
              <div className="small opacity-75">{c.customer.phone}</div>
              <div className="small text-truncate mt-1">{c.lastMessage || 'Khách vừa bắt đầu chat'}</div>
              {c.status === 'closed' && <div className="small mt-1 text-truncate">{c.rating ? '★'.repeat(c.rating.stars) + '☆'.repeat(5 - c.rating.stars) + ' · ' + (c.rating.comment || 'Không có nhận xét') : 'Chưa đánh giá'}</div>}
              <div className="small opacity-75 mt-1">{new Date(c.lastMessageAt).toLocaleString('vi-VN')}{c.assignedTo && ` · ${c.assignedTo.name}`}</div>
            </ListGroup.Item>)}
          </ListGroup>
          {!loading && list.data.length === 0 && <p className="p-4 text-muted small">Chưa có hội thoại trong mục này.</p>}
        </div>
        {list.total > 50 && <div className="p-2 border-top d-flex justify-content-between align-items-center small">
          <Button size="sm" variant="outline-secondary" disabled={page === 1 || busy} onClick={() => setPage((p) => p - 1)}>Trước</Button>
          {page} / {Math.ceil(list.total / 50)}
          <Button size="sm" variant="outline-secondary" disabled={page * 50 >= list.total || busy} onClick={() => setPage((p) => p + 1)}>Sau</Button>
        </div>}
      </Col>
      <Col xs={12} lg={8} className="d-flex flex-column" style={{ height: 650 }}>
        {conversation ? <>
          <div className="p-3 border-bottom">
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
              <div><strong>{conversation.customer.name}</strong> <Badge bg="secondary">{chatStatus[conversation.status]}</Badge>
                <div className="small text-muted mt-1">{conversation.customer.phone}{conversation.customer.email && ` · ${conversation.customer.email}`}
                  {conversation.customer.gender && ` · ${genderLabels[conversation.customer.gender]}`}</div>
                {conversation.assignedTo && <div className="small mt-1">Phụ trách: {conversation.assignedTo.name}{!conversation.assignedTo.isActive && ' (Tài khoản đã khóa)'}</div>}
              </div>
              <div className="d-flex gap-2">
                {conversation.status === 'waiting' && <Button size="sm" disabled={busy || !accepting || !connected} onClick={() => act('claim')}>Tiếp nhận</Button>}
                {canReply && <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => act('close')}>Kết thúc</Button>}
              </div>
            </div>
            {isAdmin && conversation.status !== 'closed' && <div className="d-flex flex-wrap gap-2 mt-2">
              <Form.Select size="sm" aria-label="Nhân viên tiếp nhận" style={{ maxWidth: 220 }} value={transferTo} onChange={(e) => setTransferTo(e.target.value)} disabled={busy}>
                <option value="">Chọn nhân viên để chuyển</option>{list.agents.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
              </Form.Select>
              <Button size="sm" variant="outline-primary" disabled={!transferTo || busy} onClick={() => act('transfer')}>Chuyển</Button>
              {conversation.status === 'active' && <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => act('release')}>Đưa về hàng chờ</Button>}
            </div>}
          </div>
          <div className="flex-grow-1 overflow-auto p-3 d-flex flex-column gap-2" aria-live="polite">
            {hasMore && <Button size="sm" variant="link" disabled={busy} onClick={older}>Xem tin nhắn cũ</Button>}
            <ChatMessages messages={messages} />
            {conversation.status === 'closed' && <RatingDetails conversation={conversation} />}
            <div ref={bottomRef} />
          </div>
          <div className="px-3 small text-muted" style={{ minHeight: 22 }}>{typing}</div>
          {canReply ? <div className="border-top p-3"><ChatComposer key={conversation._id} conversationId={conversation._id}
            disabled={busy} onBusyChange={setBusy} onSend={send}
            onTyping={() => socketRef.current?.emit('chat:typing', { conversationId: conversation._id })} /></div> : <div className="p-3 border-top small text-muted">{conversation.status === 'closed' ? 'Hội thoại đã kết thúc.' : 'Tiếp nhận hội thoại để bắt đầu trả lời khách hàng.'}</div>}
        </> : <div className="flex-grow-1 d-flex align-items-center justify-content-center text-muted small">Chọn một hội thoại để xem và tiếp nhận.</div>}
      </Col>
    </Row>
  </Container>;
}
