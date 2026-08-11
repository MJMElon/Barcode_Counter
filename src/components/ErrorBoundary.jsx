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
    // A failed lazy chunk means this tab is running an old index.html that
    // names chunks which no longer exist. A plain reload can be answered from
    // cache with that same old HTML, which fails again in exactly the same
    // way — so ask for a URL the cache cannot have. The hash carries the
    // current route, so the user comes back to the page they were on.
    this.setState({ error: null });
    const base = window.location.pathname.replace(/[?].*$/, '');
    window.location.replace(base + '?cb=' + Date.now() + (window.location.hash || ''));
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
