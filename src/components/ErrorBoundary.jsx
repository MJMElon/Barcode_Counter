import { Component } from 'react';

// Catches render errors and lazy-chunk load failures so the user sees a clear
// message + reload button instead of a blank white page.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('App error boundary:', error, info);
  }

  handleReload = () => {
    // A failed lazy chunk is usually fixed by a fresh load.
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      const msg = (this.state.error && (this.state.error.message || String(this.state.error))) || 'Unknown error';
      return (
        <div style={{ fontFamily: 'system-ui, sans-serif', padding: 22, maxWidth: 560, margin: '0 auto', color: '#0b1220' }}>
          <h2 style={{ color: '#c12842', margin: '0 0 8px' }}>Something went wrong</h2>
          <p style={{ color: '#475569', fontSize: 14 }}>
            Tap reload to try again. / Tekan muat semula untuk cuba lagi.
          </p>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#f1f5f9', border: '1px solid #cdd5de', borderRadius: 8, padding: 12, fontSize: 12, overflow: 'auto' }}>
            {msg}
          </pre>
          <button
            onClick={this.handleReload}
            style={{ padding: '12px 18px', border: 'none', borderRadius: 10, background: '#10b981', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
          >
            Reload / Muat semula
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
