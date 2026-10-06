import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress transient Vite WebSocket HMR errors in preview iframe
window.addEventListener('unhandledrejection', (event) => {
  if (
    event.reason &&
    (event.reason.message?.includes('WebSocket') ||
     event.reason.stack?.includes('vite') ||
     event.reason.stack?.includes('WebSocket'))
  ) {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(<App />);
