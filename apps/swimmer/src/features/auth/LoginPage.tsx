import { useState } from 'react';
import { Button, Form, Input, Toast } from 'antd-mobile';
import { useNavigate } from 'react-router-dom';
import { login, getMe } from '../../lib/api/endpoints';
import { useAuthStore } from '../../lib/auth-store';

export function LoginPage() {
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  const onFinish = async (v: { email: string; password: string }) => {
    setLoading(true);
    try {
      const { accessToken, refreshToken } = await login(v);
      useAuthStore.getState().setAuth(accessToken, { id: '', email: v.email, role: 'SWIMMER' }, refreshToken);
      const me = await getMe();
      setAuth(accessToken, me, refreshToken);
      navigate('/');
    } catch (e: any) {
      Toast.show({ content: e?.response?.data?.message ?? '登录失败' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <h2>游泳者登录</h2>
      <Form
        onFinish={onFinish}
        footer={
          <Button block type="submit" color="primary" loading={loading}>
            登录
          </Button>
        }
      >
        <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
          <Input placeholder="邮箱" clearable />
        </Form.Item>
        <Form.Item name="password" label="密码" rules={[{ required: true, min: 8, message: '至少 8 位' }]}>
          <Input type="password" placeholder="密码（≥8）" clearable />
        </Form.Item>
      </Form>
    </div>
  );
}
