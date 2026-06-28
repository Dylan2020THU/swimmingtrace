import { useState } from 'react';
import { Button, Card, Form, Input, Segmented, App } from 'antd';
import { useNavigate } from 'react-router-dom';
import { login, register, getMe } from '../../lib/api/endpoints';
import { useAuthStore } from '../../lib/auth-store';

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();
  const { message } = App.useApp();

  const onFinish = async (v: { email: string; password: string }) => {
    setLoading(true);
    try {
      const { accessToken, refreshToken } = mode === 'login'
        ? await login(v)
        : await register({ ...v, role: 'OWNER' });
      useAuthStore.getState().setAuth(accessToken, { id: '', email: v.email, role: 'OWNER' }, refreshToken);
      const me = await getMe();
      setAuth(accessToken, me, refreshToken);
      navigate('/pools');
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <Card title="Swim 管理控制台" style={{ width: 360 }}>
        <Segmented
          block
          options={[{ label: '登录', value: 'login' }, { label: '注册为 OWNER', value: 'register' }]}
          value={mode}
          onChange={(v) => setMode(v as 'login' | 'register')}
          style={{ marginBottom: 16 }}
        />
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
            <Input autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, min: 8, message: '至少 8 位' }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <div style={{ textAlign: 'right', marginBottom: 8 }}>
            <a onClick={() => navigate('/forgot-password')}>忘记密码？</a>
          </div>
          <Button type="primary" htmlType="submit" block loading={loading} autoInsertSpace={false}>
            {mode === 'login' ? '登录' : '注册'}
          </Button>
        </Form>
      </Card>
    </div>
  );
}
