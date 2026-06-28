import { useState } from 'react';
import { Button, Form, Input, Toast } from 'antd-mobile';
import { useNavigate } from 'react-router-dom';
import { forgotPassword } from '../../lib/api/endpoints';

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (v: { email: string }) => {
    setLoading(true);
    try {
      await forgotPassword(v.email);
      setSent(true);
    } catch {
      Toast.show({ content: '操作失败' });
    } finally {
      setLoading(false);
    }
  };

  if (sent)
    return (
      <div style={{ padding: 16 }}>
        <p>若该邮箱已注册，重置链接已发送，请查收。</p>
        <Button block onClick={() => navigate('/login')}>
          返回登录
        </Button>
      </div>
    );

  return (
    <div style={{ padding: 16 }}>
      <h2>找回密码</h2>
      <Form
        onFinish={onFinish}
        footer={
          <Button block type="submit" color="primary" loading={loading}>
            发送重置链接
          </Button>
        }
      >
        <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
          <Input placeholder="邮箱" clearable />
        </Form.Item>
      </Form>
    </div>
  );
}
