import { jsx as _jsx } from "react/jsx-runtime";
import { createBrowserRouter } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './routes/HomePage';
import { ProductionPage } from './routes/ProductionPage';
import { CheckoutSuccessPage } from './routes/CheckoutSuccessPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { MonitorPage } from './routes/MonitorPage';
import { FAQPage } from './routes/FAQPage';
import { SubscriptionManagementPage } from './routes/SubscriptionManagementPage';
export const router = createBrowserRouter([
    {
        path: '/',
        element: _jsx(Layout, {}),
        errorElement: _jsx(NotFoundPage, {}),
        children: [
            {
                index: true,
                element: _jsx(HomePage, {}),
            },
            {
                path: 'productions/:slug',
                element: _jsx(ProductionPage, {}),
            },
            {
                path: 'checkout/success',
                element: _jsx(CheckoutSuccessPage, {}),
            },
            {
                path: 'monitor',
                element: _jsx(MonitorPage, {}),
            },
            {
                path: 'faq',
                element: _jsx(FAQPage, {}),
            },
            {
                path: 'manage',
                element: _jsx(SubscriptionManagementPage, {}),
            },
            {
                path: '*',
                element: _jsx(NotFoundPage, {}),
            },
        ],
    },
]);
