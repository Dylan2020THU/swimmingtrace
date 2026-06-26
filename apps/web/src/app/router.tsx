import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { LoginPage } from '../features/auth/LoginPage';
import { AppLayout } from '../components/AppLayout';
import { OverviewPage } from '../features/pools/OverviewPage';
import { PoolDetailPage } from '../features/pools/PoolDetailPage';
import { SwimmerDetailPage } from '../features/swimmers/SwimmerDetailPage';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/pools" replace />} />
            <Route path="/pools" element={<OverviewPage />} />
            <Route path="/pools/:poolId" element={<PoolDetailPage />} />
            <Route path="/pools/:poolId/swimmers/:sid" element={<SwimmerDetailPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/pools" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
