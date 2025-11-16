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
    element: <Layout />,
    errorElement: <NotFoundPage />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: 'productions/:slug',
        element: <ProductionPage />,
      },
      {
        path: 'checkout/success',
        element: <CheckoutSuccessPage />,
      },
      {
        path: 'monitor',
        element: <MonitorPage />,
      },
      {
        path: 'faq',
        element: <FAQPage />,
      },
      {
        path: 'manage',
        element: <SubscriptionManagementPage />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);

