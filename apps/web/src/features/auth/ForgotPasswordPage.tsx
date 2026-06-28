import { useState } from 'react';
import { Button, Card, Form, Input, App } from 'antd';
import { useNavigate } from 'react-router-dom';
import { forgotPassword } from '../../lib/api/endpoints';

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { message } = App.useApp();

  const onFinish = async (v: { email: string }) => {
    setLoading(true);
    try {
      await forgotPassword(v.email);
      setSent(true);
    } catch {
      message.error('操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <Card title="找回密码" style={{ width: 360 }}>
        {sent ? (
          <>
            <p>若该邮箱已注册，重置链接已发送，请查收。</p>
            <Button block onClick={() => navigate('/login')}>
              返回登录
            </Button>
          </>
        ) : (
          <Form layout="vertical" onFinish={onFinish}>
            <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
              <Input autoComplete="username" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading} autoInsertSpace={false}>
              发送重置链接
            </Button>
          </Form>
        )}
      </Card>
    </div>
  );
}
