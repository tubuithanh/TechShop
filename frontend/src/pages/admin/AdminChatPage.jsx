import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
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

  useEffect(() => {
    chatService.getConversations().then(setConversations);

    const socket = io('/', { auth: { token: getAccessToken() } });
    socketRef.current = socket;
    socket.on('chat:message', (msg) => {
      if (msg.conversationId === activeConv) {
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
    <div>
      <h1 className="text-xl font-bold mb-4">Chat với khách hàng</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white rounded-lg shadow-sm overflow-hidden" style={{ height: 500 }}>
        <div className="border-r overflow-y-auto">
          {conversations.map((c) => (
            <button
              key={c._id}
              onClick={() => openConversation(c._id)}
              className={`w-full text-left p-3 border-b text-sm ${activeConv === c._id ? 'bg-red-50' : ''}`}
            >
              <div className="font-medium truncate">Khách hàng #{c._id.slice(-6)}</div>
              <div className="text-xs text-gray-500 truncate">{c.lastMessage}</div>
            </button>
          ))}
          {conversations.length === 0 && <div className="p-4 text-sm text-gray-400">Chưa có hội thoại nào</div>}
        </div>

        <div className="col-span-2 flex flex-col">
          {activeConv ? (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {messages.map((m, idx) => {
                  const isMine = m.sender?._id === user._id;
                  return (
                    <div key={m._id || idx} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${isMine ? 'bg-red-600 text-white' : 'bg-gray-100'}`}>
                        {m.content}
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <form onSubmit={handleSend} className="border-t p-3 flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Nhập phản hồi..."
                  className="flex-1 border rounded px-3 py-2 text-sm"
                />
                <button type="submit" className="bg-red-600 text-white px-4 rounded text-sm">
                  Gửi
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              Chọn một hội thoại để bắt đầu trả lời
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
