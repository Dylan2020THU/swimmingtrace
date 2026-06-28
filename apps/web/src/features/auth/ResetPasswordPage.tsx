import { useState } from 'react';
import { Button, Card, Form, Input, App } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../../lib/api/endpoints';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { message } = App.useApp();

  const onFinish = async (v: { password: string; confirm: string }) => {
    if (v.password !== v.confirm) {
      message.error('两次密码不一致');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, v.password);
      message.success('密码已重置，请用新密码登录');
      navigate('/login');
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? '重置失败，链接可能已失效');
    } finally {
      setLoading(false);
    }
  };

  if (!token) return <div style={{ paddingTop: 80, textAlign: 'center' }}>链接无效</div>;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <Card title="重置密码" style={{ width: 360 }}>
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="password" label="新密码" rules={[{ required: true, min: 8, message: '至少 8 位' }]}>
            <Input.Password placeholder="新密码（≥8）" autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="confirm" label="确认新密码" rules={[{ required: true, message: '请再次输入' }]}>
            <Input.Password placeholder="再次输入" autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading} autoInsertSpace={false}>
            重置密码
          </Button>
        </Form>
      </Card>
    </div>
  );
}
