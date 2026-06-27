import { Navigate, Outlet } from 'react-router-dom';
import { ErrorBlock } from 'antd-mobile';
import { useAuthStore } from '../lib/auth-store';

export function ProtectedRoute() {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (user && user.role !== 'SWIMMER') {
    return <ErrorBlock status="empty" title="请使用 owner 控制台" description="此端仅供游泳者使用。" />;
  }
  return <Outlet />;
}
