import { useState } from 'react';
import { useAuth } from '../store/AuthContext';
import { productService } from '../services/productService';

export default function ProductQnA({ productId, questions, setQuestions }) {
  const { user } = useAuth();
  const [newQuestion, setNewQuestion] = useState('');
  const [answerDrafts, setAnswerDrafts] = useState({});

  const handleAskQuestion = async (e) => {
    e.preventDefault();
    if (!newQuestion.trim()) return;
    const created = await productService.createQuestion(productId, newQuestion);
    setQuestions([created, ...questions]);
    setNewQuestion('');
  };

  const handleAnswer = async (questionId) => {
    const content = answerDrafts[questionId];
    if (!content?.trim()) return;
    const updated = await productService.answerQuestion(questionId, content);
    setQuestions(questions.map((q) => (q._id === questionId ? updated : q)));
    setAnswerDrafts({ ...answerDrafts, [questionId]: '' });
  };

  return (
    <div>
      {user ? (
        <form onSubmit={handleAskQuestion} className="flex gap-2 mb-6 max-w-lg">
          <input
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder="Đặt câu hỏi về sản phẩm này..."
            className="flex-1 border rounded px-3 py-2 text-sm"
          />
          <button type="submit" className="bg-red-600 text-white px-4 py-2 rounded text-sm whitespace-nowrap">
            Gửi câu hỏi
          </button>
        </form>
      ) : (
        <p className="text-sm text-gray-500 mb-6">Vui lòng đăng nhập để đặt câu hỏi về sản phẩm.</p>
      )}

      <div className="space-y-4">
        {questions.map((q) => (
          <div key={q._id} className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm">{q.userId?.displayName || 'Ẩn danh'}</span>
              <span className="text-xs text-gray-400">{new Date(q.createdAt).toLocaleDateString('vi-VN')}</span>
            </div>
            <p className="text-sm mb-2">❓ {q.content}</p>

            {q.answers?.length > 0 && (
              <div className="pl-4 border-l-2 border-gray-100 space-y-2 mb-2">
                {q.answers.map((a, idx) => (
                  <div key={idx} className="text-sm">
                    <span className={`font-medium ${a.isFromShop ? 'text-red-600' : ''}`}>
                      {a.isFromShop ? '🏪 Shop trả lời' : 'Khách hàng'}:
                    </span>{' '}
                    {a.content}
                  </div>
                ))}
              </div>
            )}

            {user && (
              <div className="flex gap-2 mt-2">
                <input
                  value={answerDrafts[q._id] || ''}
                  onChange={(e) => setAnswerDrafts({ ...answerDrafts, [q._id]: e.target.value })}
                  placeholder="Trả lời câu hỏi này..."
                  className="flex-1 border rounded px-2 py-1 text-xs"
                />
                <button onClick={() => handleAnswer(q._id)} className="text-xs text-red-600 whitespace-nowrap">
                  Trả lời
                </button>
              </div>
            )}
          </div>
        ))}
        {questions.length === 0 && <div className="text-sm text-gray-400">Chưa có câu hỏi nào cho sản phẩm này</div>}
      </div>
    </div>
  );
}
