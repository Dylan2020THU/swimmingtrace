import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppShell } from '../components/AppShell';
import { ClaimPage } from '../features/auth/ClaimPage';
import { LoginPage } from '../features/auth/LoginPage';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { RecordPage } from '../features/record/RecordPage';
import { HistoryPage } from '../features/history/HistoryPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { ChallengesPage } from '../features/challenges/ChallengesPage';
import { NearbyPoolsPage } from '../features/nearby/NearbyPoolsPage';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/claim/:token" element={<ClaimPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/challenges" element={<ChallengesPage />} />
            <Route path="/record" element={<RecordPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/nearby" element={<NearbyPoolsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
