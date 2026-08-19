import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Container, Row, Col, Form, Button, ListGroup } from 'react-bootstrap';
import { useAuth } from '../../store/AuthContext';
import { getAccessToken } from '../../services/api';
import { chatService } from '../../services/chatService';

export default function AdminChatPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const socketRef = useRef(null);
  const bottomRef = useRef(null);
  const activeConvRef = useRef(null);

  useEffect(() => {
    chatService.getConversations().then(setConversations);

    const socket = io('/', { auth: { token: getAccessToken() } });
    socketRef.current = socket;
    socket.on('chat:message', (msg) => {
      // Đọc từ ref thay vì closure của activeConv để luôn thấy hội thoại đang mở mới nhất
      if (msg.conversationId === activeConvRef.current) {
        setMessages((prev) => [...prev, msg]);
      }
      chatService.getConversations().then(setConversations);
    });
    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const openConversation = async (conversationId) => {
    setActiveConv(conversationId);
    activeConvRef.current = conversationId;
    const history = await chatService.getHistory(conversationId);
    setMessages(history);
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim() || !activeConv) return;
    socketRef.current.emit('chat:message', {
      conversationId: activeConv,
      toUserId: activeConv, // gửi tới chính khách hàng (conversationId = customerId)
      content: input
    });
    setInput('');
  };

  return (
    <Container fluid>
      <h1 className="fs-4 fw-bold mb-4">Chat với khách hàng</h1>
      <Row className="bg-white rounded-3 shadow-sm g-0" style={{ height: 500 }}>
        <Col md={4} className="border-end d-flex flex-column overflow-auto">
          <ListGroup variant="flush">
            {conversations.map((c) => (
              <ListGroup.Item
                key={c._id}
                action
                active={activeConv === c._id}
                onClick={() => openConversation(c._id)}
                className="py-3"
              >
                <div className="fw-medium text-truncate">Khách hàng #{c._id.slice(-6)}</div>
                <div className="small text-muted text-truncate">{c.lastMessage}</div>
              </ListGroup.Item>
            ))}
          </ListGroup>
          {conversations.length === 0 && <div className="p-4 small text-muted">Chưa có hội thoại nào</div>}
        </Col>

        <Col md={8} className="d-flex flex-column">
          {activeConv ? (
            <>
              <div className="flex-grow-1 overflow-auto p-3 d-flex flex-column gap-2">
                {messages.map((m, idx) => {
                  const isMine = m.sender?._id === user._id;
                  return (
                    <div key={m._id || idx} className={`d-flex ${isMine ? 'justify-content-end' : 'justify-content-start'}`}>
                      <div
                        className={`rounded-3 px-3 py-2 small ${isMine ? 'bg-primary text-white' : 'bg-light'}`}
                        style={{ maxWidth: '70%' }}
                      >
                        {m.content}
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <Form onSubmit={handleSend} className="border-top p-3 d-flex gap-2">
                <Form.Control value={input} onChange={(e) => setInput(e.target.value)} placeholder="Nhập phản hồi..." />
                <Button type="submit" variant="primary">
                  Gửi
                </Button>
              </Form>
            </>
          ) : (
            <div className="flex-grow-1 d-flex align-items-center justify-content-center text-muted small">
              Chọn một hội thoại để bắt đầu trả lời
            </div>
          )}
        </Col>
      </Row>
    </Container>
  );
}
