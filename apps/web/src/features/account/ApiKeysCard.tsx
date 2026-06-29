import { useState } from 'react';
import { App, Button, Card, Input, List, Modal, Popconfirm, Tag, Typography } from 'antd';
import { usePlan, useApiKeys, useCreateApiKey, useRevokeApiKey } from '../../lib/queries';

export function ApiKeysCard() {
  const { message } = App.useApp();
  const plan = usePlan();
  const keys = useApiKeys();
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [created, setCreated] = useState<string | null>(null);

  const enabled = plan.data?.features.apiKeys ?? false;

  const close = () => {
    setOpen(false);
    setCreated(null);
    setLabel('');
  };

  const onCreate = async () => {
    try {
      const res = await create.mutateAsync(label);
      setCreated(res.key);
      setLabel('');
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? '创建失败');
    }
  };

  const onRevoke = async (id: string) => {
    try {
      await revoke.mutateAsync(id);
      message.success('已撤销');
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? '撤销失败');
    }
  };

  return (
    <Card
      title="API Keys"
      extra={enabled ? <Button type="primary" onClick={() => setOpen(true)}>新建</Button> : <Tag>需 Pro</Tag>}
    >
      {!enabled && (
        <Typography.Paragraph type="secondary">
          API Keys 为 Pro 功能，升级到 Pro 解锁程序化访问（脚本携 `Authorization: Bearer swk_…` 调用 API）。
        </Typography.Paragraph>
      )}
      <List
        loading={keys.isLoading}
        dataSource={keys.data ?? []}
        locale={{ emptyText: '还没有 key' }}
        renderItem={(k) => (
          <List.Item
            actions={[
              <Popconfirm key="rm" title="撤销该 key？撤销后立即失效。" okText="确认撤销" cancelText="取消" onConfirm={() => onRevoke(k.id)}>
                <a>撤销</a>
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta
              title={`${k.label} · ${k.prefix}…`}
              description={k.lastUsedAt ? `最后使用 ${new Date(k.lastUsedAt).toLocaleString()}` : '从未使用'}
            />
          </List.Item>
        )}
      />
      <Modal
        title="新建 API Key"
        open={open}
        onCancel={close}
        okText="创建"
        okButtonProps={{ loading: create.isPending, disabled: !label }}
        onOk={onCreate}
        footer={created ? [<Button key="done" type="primary" onClick={close}>完成</Button>] : undefined}
      >
        {created ? (
          <>
            <Typography.Paragraph type="danger">请立即复制——此密钥只显示一次：</Typography.Paragraph>
            <Input value={created} readOnly />
            <Button
              style={{ marginTop: 12 }}
              onClick={() => {
                navigator.clipboard?.writeText(created);
                message.success('已复制');
              }}
            >
              复制
            </Button>
          </>
        ) : (
          <Input placeholder="标签（如 CI 部署脚本）" value={label} onChange={(e) => setLabel(e.target.value)} />
        )}
      </Modal>
    </Card>
  );
}
