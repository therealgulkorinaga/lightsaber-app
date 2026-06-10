import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/colors_and_type.css';
import './styles/design-system.css';
import './styles/app.css';
import './styles/screens.css';
import { App } from './App.tsx';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
