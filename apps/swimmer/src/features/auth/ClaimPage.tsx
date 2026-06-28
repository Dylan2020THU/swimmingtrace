import { useEffect, useState } from 'react';
import { Button, ErrorBlock, Form, Input, Toast } from 'antd-mobile';
import { useNavigate, useParams } from 'react-router-dom';
import { getClaimInfo, claim, getMe } from '../../lib/api/endpoints';
import { useAuthStore } from '../../lib/auth-store';

export function ClaimPage() {
  const { token = '' } = useParams();
  const [info, setInfo] = useState<{ email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  useEffect(() => {
    getClaimInfo(token)
      .then((i) => setInfo(i))
      .catch((e) => {
        const status = e?.response?.status;
        setError(status === 410 ? '认领链接已过期' : status === 409 ? '该账号已被认领' : '认领链接无效');
      });
  }, [token]);

  const onFinish = async (v: { password: string; confirm: string }) => {
    if (v.password !== v.confirm) {
      Toast.show({ content: '两次密码不一致' });
      return;
    }
    setLoading(true);
    try {
      const { accessToken, refreshToken } = await claim({ token, password: v.password });
      setAuth(accessToken, { id: '', email: info?.email ?? '', role: 'SWIMMER' }, refreshToken);
      const me = await getMe();
      setAuth(accessToken, me, refreshToken);
      navigate('/');
    } catch (e: any) {
      Toast.show({ content: e?.response?.data?.message ?? '认领失败' });
    } finally {
      setLoading(false);
    }
  };

  if (error) return <ErrorBlock status="empty" title="无法认领" description={error} />;
  if (!info) return <div style={{ padding: 16 }}>加载中…</div>;

  return (
    <div style={{ padding: 16 }}>
      <h2>认领账号</h2>
      <p>为 {info.email} 设置登录密码</p>
      <Form
        onFinish={onFinish}
        footer={
          <Button block type="submit" color="primary" loading={loading}>
            认领并登录
          </Button>
        }
      >
        <Form.Item name="password" label="密码" rules={[{ required: true, min: 8, message: '至少 8 位' }]}>
          <Input type="password" placeholder="设置密码（≥8）" clearable />
        </Form.Item>
        <Form.Item name="confirm" label="确认" rules={[{ required: true, message: '请再次输入' }]}>
          <Input type="password" placeholder="再次输入" clearable />
        </Form.Item>
      </Form>
    </div>
  );
}
