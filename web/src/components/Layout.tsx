import { Outlet, ScrollRestoration } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';

export const Layout = () => (
  <div className="app-shell">
    <Header />
    <main className="page-shell">
      <Outlet />
    </main>
    <Footer />
    <ScrollRestoration />
  </div>
);

