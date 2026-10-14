import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { DialogProvider } from './components/common/Dialogs';

// Trigger deployment
createRoot(document.getElementById('root')!).render(<DialogProvider><App /></DialogProvider>);
