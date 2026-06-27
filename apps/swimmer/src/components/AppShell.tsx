import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { TabBar } from 'antd-mobile';

const tabs = [
  { key: '/', title: '看板' },
  { key: '/challenges', title: '挑战' },
  { key: '/history', title: '历史' },
  { key: '/profile', title: '我的' },
];

export function AppShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = tabs.some((t) => t.key === pathname) ? pathname : '/';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div style={{ flex: 1, padding: 12, paddingBottom: 64 }}>
        <Outlet />
      </div>
      <div style={{ position: 'fixed', bottom: 0, width: '100%', background: '#fff', borderTop: '1px solid #eee' }}>
        <TabBar activeKey={active} onChange={(k) => navigate(k)}>
          {tabs.map((t) => (
            <TabBar.Item key={t.key} title={t.title} />
          ))}
        </TabBar>
      </div>
    </div>
  );
}
