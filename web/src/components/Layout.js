import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Outlet, ScrollRestoration } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
export const Layout = () => (_jsxs("div", { className: "app-shell", children: [_jsx(Header, {}), _jsx("main", { className: "page-shell", children: _jsx(Outlet, {}) }), _jsx(Footer, {}), _jsx(ScrollRestoration, {})] }));
