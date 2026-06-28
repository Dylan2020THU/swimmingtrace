import { useState } from 'react';
import { Button, Form, Input, Toast } from 'antd-mobile';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../../lib/api/endpoints';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (v: { password: string; confirm: string }) => {
    if (v.password !== v.confirm) {
      Toast.show({ content: '两次密码不一致' });
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, v.password);
      Toast.show({ content: '密码已重置，请用新密码登录' });
      navigate('/login');
    } catch (e: any) {
      Toast.show({ content: e?.response?.data?.message ?? '重置失败，链接可能已失效' });
    } finally {
      setLoading(false);
    }
  };

  if (!token) return <div style={{ padding: 16 }}>链接无效</div>;

  return (
    <div style={{ padding: 16 }}>
      <h2>重置密码</h2>
      <Form
        onFinish={onFinish}
        footer={
          <Button block type="submit" color="primary" loading={loading}>
            重置密码
          </Button>
        }
      >
        <Form.Item name="password" label="新密码" rules={[{ required: true, min: 8, message: '至少 8 位' }]}>
          <Input type="password" placeholder="新密码（≥8）" clearable />
        </Form.Item>
        <Form.Item name="confirm" label="确认" rules={[{ required: true, message: '请再次输入' }]}>
          <Input type="password" placeholder="再次输入" clearable />
        </Form.Item>
      </Form>
    </div>
  );
}
