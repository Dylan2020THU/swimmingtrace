import { useState } from 'react';
import { Button, Input, Modal, Space, Typography, App } from 'antd';
import dayjs from 'dayjs';
import { useGenerateClaimLink } from '../../lib/queries';

/** Owner action: generate a one-time claim link for a swimmer and show it to copy. */
export function ClaimLinkButton({ poolId, sid, claimed }: { poolId: string; sid: string; claimed: boolean }) {
  const gen = useGenerateClaimLink(poolId, sid);
  const [open, setOpen] = useState(false);
  const { message } = App.useApp();

  if (claimed) {
    return (
      <Button size="small" disabled autoInsertSpace={false}>
        已认领
      </Button>
    );
  }

  const onClick = async () => {
    try {
      await gen.mutateAsync();
      setOpen(true);
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? '生成失败');
    }
  };

  const copy = async () => {
    if (gen.data) {
      await navigator.clipboard.writeText(gen.data.claimUrl);
      message.success('已复制');
    }
  };

  return (
    <>
      <Button size="small" loading={gen.isPending} autoInsertSpace={false} onClick={(e) => { e.stopPropagation(); onClick(); }}>
        生成认领链接
      </Button>
      <Modal title="认领链接" open={open} onCancel={() => setOpen(false)} footer={null}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            把链接发给游泳者，TA 打开后设密码即可登录。
            {gen.data ? `（${dayjs(gen.data.expiresAt).format('YYYY-MM-DD')} 前有效）` : ''}
          </Typography.Text>
          <Typography.Text type="success">已发送邮件至该游泳者邮箱。</Typography.Text>
          <Space.Compact style={{ width: '100%' }}>
            <Input readOnly value={gen.data?.claimUrl} />
            <Button type="primary" autoInsertSpace={false} onClick={copy}>
              复制
            </Button>
          </Space.Compact>
        </Space>
      </Modal>
    </>
  );
}
