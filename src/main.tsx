import {createRoot} from 'react-dom/client';
import { initProtobufHttpsTransport } from './lib/protobufClient';
import App from './App.tsx';
import './index.css';

initProtobufHttpsTransport();

createRoot(document.getElementById('root')!).render(<App />);

