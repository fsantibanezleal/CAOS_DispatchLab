import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Truck } from 'lucide-react';
import { AppShell, applyTheme, readTheme, CitationsProvider, type ShellConfig } from '@fasl-work/caos-app-shell';
import '@fasl-work/caos-app-shell/styles.css';
import './dispatchlab.css';
import { CITATIONS } from './data/citations';
import Sim from './pages/Sim';
import Compare from './pages/Compare';
import Methodology from './pages/Methodology';
import About from './pages/About';

applyTheme(readTheme());

const config: ShellConfig = {
  product: { name: 'DispatchLab', mark: <Truck size={18} aria-hidden="true" /> },
  routes: [
    { path: '/', en: 'Bench', es: 'Banco' },
    { path: '/compare', en: 'Compare', es: 'Comparar' },
    { path: '/methodology', en: 'Methodology', es: 'Metodología' },
    { path: '/about', en: 'About', es: 'Acerca' },
  ],
  links: { github: 'https://github.com/fsantibanezleal/CAOS_DispatchLab' },
  version: '0.02.000',
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <CitationsProvider items={CITATIONS}>
        <AppShell config={config}>
          <Routes>
            <Route path="/" element={<Sim />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/methodology" element={<Methodology />} />
            <Route path="/about" element={<About />} />
            <Route path="*" element={<Sim />} />
          </Routes>
        </AppShell>
      </CitationsProvider>
    </BrowserRouter>
  </StrictMode>,
);
