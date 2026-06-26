import { Layout, Menu, Select, Button, Space, Typography } from 'antd';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { usePools } from '../lib/queries';
import { useAuthStore } from '../lib/auth-store';

export function AppLayout() {
  const navigate = useNavigate();
  const { poolId } = useParams();
  const { data: pools } = usePools();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

  const logout = () => { clear(); navigate('/login'); };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography.Text strong style={{ color: '#fff' }}>Swim 控制台</Typography.Text>
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
      <Layout>
        <Layout.Sider theme="light" width={180}>
          <Menu mode="inline" selectable={false} items={[{ key: 'overview', label: '总览', onClick: () => navigate('/pools') }]} />
        </Layout.Sider>
        <Layout.Content style={{ padding: 24 }}><Outlet /></Layout.Content>
      </Layout>
    </Layout>
  );
}
