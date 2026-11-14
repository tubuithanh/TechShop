import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Button, Container, Form, InputGroup, Spinner } from 'react-bootstrap';
import { Search, Printer } from 'react-bootstrap-icons';
import api from '../services/api';
import EInvoiceView from '../components/EInvoiceView';

// TRA CỨU HÓA ĐƠN ĐIỆN TỬ (công khai): khách nhập mã tra cứu in trên hóa đơn / email
export default function EInvoiceLookupPage() {
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState(params.get('code') || '');
  const [inv, setInv] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const find = async (c) => {
    const v = String(c || '').trim().toUpperCase();
    if (!v) return;
    setLoading(true); setError(''); setInv(null);
    try { setInv((await api.get(`/einvoices/lookup/${v}`)).data.data); setParams({ code: v }); }
    catch (e) { setError(e.response?.data?.message || 'Không tìm thấy hóa đơn'); } finally { setLoading(false); }
  };
  useEffect(() => { if (params.get('code')) find(params.get('code')); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Container className="py-4">
      <h1 className="fs-4 fw-bold mb-1">Tra cứu hóa đơn điện tử</h1>
      <p className="text-muted small">Nhập mã tra cứu in trên hóa đơn hoặc trong email TechShop gửi bạn.</p>
      <Form onSubmit={(e) => { e.preventDefault(); find(code); }} className="mb-3" style={{ maxWidth: 480 }}>
        <InputGroup>
          <Form.Control placeholder="VD: 7KQ2XWAB3D" value={code} onChange={(e) => setCode(e.target.value)} className="text-uppercase" aria-label="Mã tra cứu" />
          <Button type="submit" disabled={loading}>{loading ? <Spinner size="sm" /> : <><Search className="me-1" />Tra cứu</>}</Button>
        </InputGroup>
      </Form>
      {error && <Alert variant="warning">{error}</Alert>}
      {inv && (
        <>
          <div className="text-end mb-2"><Button variant="outline-secondary" size="sm" onClick={() => window.print()}><Printer className="me-1" />In hóa đơn</Button></div>
          <EInvoiceView inv={inv} />
        </>
      )}
    </Container>
  );
}
