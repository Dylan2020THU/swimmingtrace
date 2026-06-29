import { useState } from 'react';
import { App, Button, Card, Input, Modal, Space, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { exportAccount, deleteAccount } from '../../lib/api/endpoints';
import { useAuthStore } from '../../lib/auth-store';
import { PlanCard } from './PlanCard';

export function AccountPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const clear = useAuthStore((s) => s.clear);
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const onExport = async () => {
    setExporting(true);
    try {
      const data = await exportAccount();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'account-export.json';
      a.click();
      URL.revokeObjectURL(url);
      message.success('已导出');
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? '导出失败');
    } finally {
      setExporting(false);
    }
  };

  const onDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount(password);
      clear();
      navigate('/login');
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Typography.Title level={3}>账号与数据</Typography.Title>
      <PlanCard />
      <Card title="导出我的数据">
        <Typography.Paragraph type="secondary">
          导出账号及名下全部泳池、会员、记录、挑战为 JSON 文件（数据可携）。
        </Typography.Paragraph>
        <Button onClick={onExport} loading={exporting}>
          导出 JSON
        </Button>
      </Card>
      <Card title="删除账号">
        <Typography.Paragraph type="danger">
          此操作不可恢复：将永久删除你的账号及名下全部数据（泳池、会员登记、记录、挑战）。
        </Typography.Paragraph>
        <Button danger onClick={() => setOpen(true)}>
          删除账号
        </Button>
      </Card>
      <Modal
        title="确认删除账号"
        open={open}
        onCancel={() => setOpen(false)}
        okText="确认删除"
        okButtonProps={{ danger: true, loading: deleting, disabled: !password }}
        onOk={onDelete}
      >
        <Typography.Paragraph>请输入登录密码以确认。此操作不可恢复。</Typography.Paragraph>
        <Input.Password
          placeholder="登录密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Modal>
    </Space>
  );
}
