import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { LoginPage } from '../features/auth/LoginPage';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { VerifyEmailPage } from '../features/auth/VerifyEmailPage';
import { AppLayout } from '../components/AppLayout';
import { OverviewPage } from '../features/pools/OverviewPage';
import { PoolDetailPage } from '../features/pools/PoolDetailPage';
import { SwimmerDetailPage } from '../features/swimmers/SwimmerDetailPage';
import { SwimmerStatsPage } from '../features/swimmers/SwimmerStatsPage';
import { ChallengeDetailPage } from '../features/challenges/ChallengeDetailPage';
import { AccountPage } from '../features/account/AccountPage';
import { MeetsListPage } from '../features/meets/MeetsListPage';
import { MeetDetailPage } from '../features/meets/MeetDetailPage';
import { MeetPublicPage } from '../features/meets/MeetPublicPage';
import { SeasonsListPage } from '../features/seasons/SeasonsListPage';
import { SeasonDetailPage } from '../features/seasons/SeasonDetailPage';
import { SeasonPublicPage } from '../features/seasons/SeasonPublicPage';
import { RecordsPage } from '../features/records/RecordsPage';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/p/meets/:meetId" element={<MeetPublicPage />} />
        <Route path="/p/seasons/:seasonId" element={<SeasonPublicPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/pools" replace />} />
            <Route path="/pools" element={<OverviewPage />} />
            <Route path="/pools/:poolId" element={<PoolDetailPage />} />
            <Route path="/pools/:poolId/swimmers/:sid" element={<SwimmerDetailPage />} />
            <Route path="/swimmers/:sid" element={<SwimmerStatsPage />} />
            <Route path="/pools/:poolId/challenges/:cid" element={<ChallengeDetailPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/meets" element={<MeetsListPage />} />
            <Route path="/meets/:meetId" element={<MeetDetailPage />} />
            <Route path="/seasons" element={<SeasonsListPage />} />
            <Route path="/seasons/:seasonId" element={<SeasonDetailPage />} />
            <Route path="/records" element={<RecordsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/pools" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
