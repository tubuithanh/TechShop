import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Card, Form, Button } from 'react-bootstrap';
import { useAuth } from '../store/AuthContext';
import api, { getAccessToken } from '../services/api';
import { chatService } from '../services/chatService';

// ID nhân viên CSKH sẽ được lấy động qua API /api/chat/support-agent
export default function ChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const socketRef = useRef(null);
  const bottomRef = useRef(null);
  const [staffId, setStaffId] = useState(null);

  // Chỉ hiển thị widget cho khách hàng đã đăng nhập (không hiện cho admin/staff, họ có trang riêng)
  const shouldShow = user && user.role === 'customer';

  useEffect(() => {
    if (!shouldShow) return;

    const token = getAccessToken();
    const socket = io('/', { auth: { token } });
    socketRef.current = socket;

    socket.on('chat:message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    // Tải lịch sử chat cũ (conversationId = chính userId của khách hàng)
    chatService.getHistory(user._id).then(setMessages).catch(() => {});

    // Lấy ID nhân viên hỗ trợ để định tuyến tin nhắn
    api
      .get('/chat/support-agent')
      .then((res) => setStaffId(res.data.data._id))
      .catch(() => {});

    return () => socket.disconnect();
  }, [shouldShow, user?._id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim() || !socketRef.current || !staffId) return;
    socketRef.current.emit('chat:message', {
      conversationId: user._id,
      toUserId: staffId,
      content: input
    });
    setInput('');
  };

  if (!shouldShow) return null;

  return (
    <div className="position-fixed" style={{ bottom: '1.5rem', right: '1.5rem', zIndex: 1050 }}>
      {open && (
        <Card className="shadow-lg mb-3" style={{ width: '20rem', height: '24rem' }}>
          <Card.Header className="bg-primary text-white d-flex justify-content-between align-items-center">
            <span className="fw-medium small">💬 Hỗ trợ khách hàng</span>
            <Button variant="link" onClick={() => setOpen(false)} className="text-white p-0 text-decoration-none">
              ✕
            </Button>
          </Card.Header>
          <Card.Body className="d-flex flex-column gap-2 p-3 overflow-auto">
            {messages.length === 0 && (
              <div className="text-muted text-center mt-4" style={{ fontSize: '0.75rem' }}>
                Chào bạn! Hãy để lại tin nhắn, nhân viên TechShop sẽ phản hồi sớm nhất.
              </div>
            )}
            {messages.map((m, idx) => {
              const isMine = m.sender?._id === user._id || m.sender === user._id;
              return (
                <div key={m._id || idx} className={`d-flex ${isMine ? 'justify-content-end' : 'justify-content-start'}`}>
                  <div
                    className={`rounded px-3 py-2 small ${isMine ? 'bg-primary text-white' : 'bg-light text-dark'}`}
                    style={{ maxWidth: '75%' }}
                  >
                    {m.content}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </Card.Body>
          <Card.Footer className="p-2">
            <Form onSubmit={handleSend} className="d-flex gap-2">
              <Form.Control
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Nhập tin nhắn..."
                size="sm"
              />
              <Button type="submit" variant="primary" size="sm">
                Gửi
              </Button>
            </Form>
          </Card.Footer>
        </Card>
      )}
      <Button
        variant="primary"
        onClick={() => setOpen(!open)}
        className="rounded-circle d-flex align-items-center justify-content-center fs-4 shadow"
        style={{ width: '3.5rem', height: '3.5rem' }}
      >
        {open ? '✕' : '💬'}
      </Button>
    </div>
  );
}
