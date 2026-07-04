import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Truck } from 'lucide-react';
import { AppShell, applyTheme, readTheme, CitationsProvider, type ShellConfig } from '@fasl-work/caos-app-shell';
import '@fasl-work/caos-app-shell/styles.css';
import './dispatchlab.css';
import { CITATIONS } from './data/citations';
import { architecture } from './architecture';
import pkg from '../package.json';
import Tool from './pages/Tool';
import Introduction from './pages/Introduction';
import Methodology from './pages/Methodology';
import Implementation from './pages/Implementation';
import Experiments from './pages/Experiments';
import Benchmark from './pages/Benchmark';

applyTheme(readTheme());

const config: ShellConfig = {
  product: { name: 'DispatchLab', mark: <Truck size={18} aria-hidden="true" /> },
  routes: [
    { path: '/', en: 'App', es: 'App' },
    { path: '/introduction', en: 'Introduction', es: 'Introducción' },
    { path: '/methodology', en: 'Methodology', es: 'Metodología' },
    { path: '/implementation', en: 'Implementation', es: 'Implementación' },
    { path: '/experiments', en: 'Experiments', es: 'Experimentos' },
    { path: '/benchmark', en: 'Benchmark', es: 'Benchmark' },
  ],
  links: { github: 'https://github.com/fsantibanezleal/CAOS_DispatchLab' },
  version: pkg.version,                       // single source: frontend/package.json
  architecture,
  // ADR-0016 §2: footer provenance + honest one-liner
  footer: {
    provenance: {
      en: 'Data: synthetic DES cases + structure-real samples from minehaulsim (PyPI, Apache-2.0)',
      es: 'Datos: casos DES sintéticos + muestras structure-real de minehaulsim (PyPI, Apache-2.0)',
    },
    disclaimer: {
      en: 'Static site, replay of committed artifacts + in-browser compute; no backend.',
      es: 'Sitio estático, replay de artefactos commiteados + cómputo en el navegador; sin backend.',
    },
  },
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <CitationsProvider items={CITATIONS}>
        <AppShell config={config}>
          <Routes>
            <Route path="/" element={<Tool />} />
            <Route path="/introduction" element={<Introduction />} />
            <Route path="/methodology" element={<Methodology />} />
            <Route path="/implementation" element={<Implementation />} />
            <Route path="/experiments" element={<Experiments />} />
            <Route path="/benchmark" element={<Benchmark />} />
            <Route path="*" element={<Tool />} />
          </Routes>
        </AppShell>
      </CitationsProvider>
    </BrowserRouter>
  </StrictMode>,
);
