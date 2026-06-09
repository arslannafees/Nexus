import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

;(window as any).__react_router_future__ = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
