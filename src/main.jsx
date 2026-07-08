import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { LanguageProvider } from './context/LanguageContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';

// HashRouter keeps deep links working on GitHub Pages without server config.
// Root-level ErrorBoundary ensures any crash above route-level boundaries
// still shows a readable error instead of a silent blank page.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <LanguageProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </LanguageProvider>
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
