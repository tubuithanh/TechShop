import { useState } from 'react';
import { Form, Button, Card } from 'react-bootstrap';
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
        <Form onSubmit={handleAskQuestion} className="d-flex gap-2 mb-4" style={{ maxWidth: '32rem' }}>
          <Form.Control
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder="Đặt câu hỏi về sản phẩm này..."
            size="sm"
          />
          <Button type="submit" variant="primary" size="sm" className="text-nowrap">
            Gửi câu hỏi
          </Button>
        </Form>
      ) : (
        <p className="small text-muted mb-4">Vui lòng đăng nhập để đặt câu hỏi về sản phẩm.</p>
      )}

      <div className="d-flex flex-column gap-3">
        {questions.map((q) => (
          <Card key={q._id}>
            <Card.Body className="p-3">
              <div className="d-flex align-items-center gap-2 mb-1">
                <span className="fw-medium small">{q.userId?.displayName || 'Ẩn danh'}</span>
                <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                  {new Date(q.createdAt).toLocaleDateString('vi-VN')}
                </span>
              </div>
              <p className="small mb-2">❓ {q.content}</p>

              {q.answers?.length > 0 && (
                <div className="ps-3 border-start d-flex flex-column gap-2 mb-2">
                  {q.answers.map((a, idx) => (
                    <div key={idx} className="small">
                      <span className={`fw-medium ${a.isFromShop ? 'text-primary' : ''}`}>
                        {a.isFromShop ? '🏪 Shop trả lời' : 'Khách hàng'}:
                      </span>{' '}
                      {a.content}
                    </div>
                  ))}
                </div>
              )}

              {user && (
                <div className="d-flex gap-2 mt-2">
                  <Form.Control
                    value={answerDrafts[q._id] || ''}
                    onChange={(e) => setAnswerDrafts({ ...answerDrafts, [q._id]: e.target.value })}
                    placeholder="Trả lời câu hỏi này..."
                    size="sm"
                    style={{ fontSize: '0.75rem' }}
                  />
                  <Button
                    onClick={() => handleAnswer(q._id)}
                    variant="link"
                    size="sm"
                    className="text-primary text-nowrap p-0"
                  >
                    Trả lời
                  </Button>
                </div>
              )}
            </Card.Body>
          </Card>
        ))}
        {questions.length === 0 && <div className="small text-muted">Chưa có câu hỏi nào cho sản phẩm này</div>}
      </div>
    </div>
  );
}
