import { Button, List } from 'antd-mobile';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../lib/auth-store';
import { logout as apiLogout } from '../../lib/api/endpoints';

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const logout = async () => {
    const rt = useAuthStore.getState().refreshToken;
    if (rt) await apiLogout(rt).catch(() => {});
    clear();
    navigate('/login');
  };
  return (
    <div>
      <List header="我的">
        <List.Item extra={user?.email}>邮箱</List.Item>
        <List.Item clickable onClick={() => navigate('/records')}>
          我的成绩
        </List.Item>
        <List.Item clickable onClick={() => navigate('/nearby')}>
          附近泳池
        </List.Item>
      </List>
      <div style={{ padding: 12 }}>
        <Button block color="danger" fill="outline" onClick={logout}>
          退出登录
        </Button>
      </div>
    </div>
  );
}
