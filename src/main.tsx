import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { DataSourceProvider } from './context/DataSourceContext';
import { createDataSource } from './data/dataSourceFactory';
import './index.css';

const ds = createDataSource();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DataSourceProvider value={ds}>
      <App />
    </DataSourceProvider>
  </React.StrictMode>
);
