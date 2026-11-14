import { useEffect, useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { FileEarmarkText } from 'react-bootstrap-icons';
import api from '../services/api';
import EInvoiceView from './EInvoiceView';

// Khách / nhân viên xem hóa đơn điện tử của 1 đơn (nếu đã phát hành)
export default function OrderEInvoice({ orderId }) {
  const [list, setList] = useState([]);
  const [show, setShow] = useState(null);
  useEffect(() => { api.get(`/einvoices/by-order/${orderId}`).then((r) => setList(r.data.data)).catch(() => setList([])); }, [orderId]);
  const current = list.find((x) => x.status === 'issued');
  if (!current) return null;
  return (
    <>
      <div className="alert alert-success d-flex align-items-center gap-2 py-2">
        <FileEarmarkText />
        <span className="flex-grow-1 small">Đơn đã có <b>hóa đơn điện tử</b> {current.template}{current.series} số {String(current.number).padStart(8, '0')} · mã tra cứu <b>{current.lookupCode}</b></span>
        <Button size="sm" variant="success" onClick={() => setShow(current)}>Xem hóa đơn</Button>
      </div>
      <Modal show={!!show} onHide={() => setShow(null)} size="xl" scrollable>
        <Modal.Header closeButton><Modal.Title className="fs-5">Hóa đơn điện tử</Modal.Title></Modal.Header>
        <Modal.Body className="bg-body-tertiary"><EInvoiceView inv={show} /></Modal.Body>
        <Modal.Footer><Button variant="outline-secondary" onClick={() => window.print()}>In</Button></Modal.Footer>
      </Modal>
    </>
  );
}
