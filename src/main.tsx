import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { DataSourceProvider } from './context/DataSourceContext';
import { MockDataSource } from './data/mockDataSource';
import './index.css';

const ds = new MockDataSource();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DataSourceProvider value={ds}>
      <App />
    </DataSourceProvider>
  </React.StrictMode>
);
