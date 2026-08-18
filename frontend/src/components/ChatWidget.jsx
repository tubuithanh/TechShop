import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
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
    if (!input.trim() || !socketRef.current) return;
    socketRef.current.emit('chat:message', {
      conversationId: user._id,
      toUserId: staffId || SUPPORT_STAFF_PLACEHOLDER,
      content: input
    });
    setInput('');
  };

  if (!shouldShow) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open && (
        <div className="w-80 h-96 bg-white rounded-lg shadow-2xl border flex flex-col mb-3">
          <div className="bg-red-600 text-white px-4 py-3 rounded-t-lg flex justify-between items-center">
            <span className="font-medium text-sm">💬 Hỗ trợ khách hàng</span>
            <button onClick={() => setOpen(false)} className="text-white">
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 && (
              <div className="text-xs text-gray-400 text-center mt-6">
                Chào bạn! Hãy để lại tin nhắn, nhân viên TechShop sẽ phản hồi sớm nhất.
              </div>
            )}
            {messages.map((m, idx) => {
              const isMine = m.sender?._id === user._id || m.sender === user._id;
              return (
                <div key={m._id || idx} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      isMine ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
          <form onSubmit={handleSend} className="border-t p-2 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Nhập tin nhắn..."
              className="flex-1 border rounded px-3 py-1.5 text-sm"
            />
            <button type="submit" className="bg-red-600 text-white px-3 rounded text-sm">
              Gửi
            </button>
          </form>
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="w-14 h-14 bg-red-600 text-white rounded-full shadow-lg flex items-center justify-center text-2xl hover:bg-red-700"
      >
        {open ? '✕' : '💬'}
      </button>
    </div>
  );
}
