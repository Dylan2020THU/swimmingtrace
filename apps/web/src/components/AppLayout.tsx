import { Layout, Menu, Select, Button, Space, Tag, Typography, Alert, App } from 'antd';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { usePools, useActiveChallenges } from '../lib/queries';
import { useAuthStore } from '../lib/auth-store';
import { logout as apiLogout, resendVerification } from '../lib/api/endpoints';

export function AppLayout() {
  const navigate = useNavigate();
  const { poolId } = useParams();
  const { data: pools } = usePools();
  const active = useActiveChallenges();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const { message } = App.useApp();

  const logout = async () => {
    const rt = useAuthStore.getState().refreshToken;
    if (rt) await apiLogout(rt).catch(() => {});
    clear();
    navigate('/login');
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space>
          <Typography.Text strong style={{ color: '#fff' }}>Swim 控制台</Typography.Text>
          {(active.data?.length ?? 0) > 0 && <Tag color="gold">赛事进行中</Tag>}
        </Space>
        <Space>
          <Select
            placeholder="切换泳池" style={{ width: 200 }} value={poolId}
            onChange={(id) => navigate(`/pools/${id}`)}
            options={(pools ?? []).map((p) => ({ label: p.name, value: p.id }))}
          />
          <Typography.Text style={{ color: '#fff' }}>{user?.email}</Typography.Text>
          <Button onClick={logout} autoInsertSpace={false}>登出</Button>
        </Space>
      </Layout.Header>
      {user && user.emailVerifiedAt == null && (
        <Alert
          type="warning"
          banner
          message="请验证你的邮箱以保障账号安全。"
          action={
            <a
              onClick={async () => {
                await resendVerification().catch(() => {});
                message.success('验证邮件已重发');
              }}
            >
              重发验证邮件
            </a>
          }
        />
      )}
      <Layout>
        <Layout.Sider theme="light" width={180}>
          <Menu
            mode="inline"
            selectable={false}
            items={[
              { key: 'overview', label: '总览', onClick: () => navigate('/pools') },
              { key: 'account', label: '账号与数据', onClick: () => navigate('/account') },
            ]}
          />
        </Layout.Sider>
        <Layout.Content style={{ padding: 24 }}><Outlet /></Layout.Content>
      </Layout>
    </Layout>
  );
}
