import { Component } from 'react';

// Bắt lỗi hiển thị của 1 trang: hiện thông báo + nút tải lại thay vì làm TRẮNG cả màn hình.
// resetKey đổi (VD: đổi trang) -> tự thử hiển thị lại.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Lỗi hiển thị]', error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="alert alert-danger m-3">
        <div className="fw-semibold mb-1">Trang gặp lỗi khi hiển thị</div>
        <div className="small mb-2 font-monospace">{String(this.state.error?.message || this.state.error)}</div>
        <button type="button" className="btn btn-sm btn-danger me-2" onClick={() => this.setState({ error: null })}>Thử lại</button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => window.location.reload()}>Tải lại trang</button>
      </div>
    );
  }
}
