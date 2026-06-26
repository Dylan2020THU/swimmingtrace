import { Navigate, Outlet } from 'react-router-dom';
import { Result } from 'antd';
import { useAuthStore } from '../lib/auth-store';

export function ProtectedRoute() {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (user && user.role !== 'OWNER') {
    return <Result status="403" title="无权限" subTitle="此控制台仅限泳池主（OWNER）。" />;
  }
  return <Outlet />;
}
