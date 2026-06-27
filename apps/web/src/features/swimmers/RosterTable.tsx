import { useState } from 'react';
import { Button, Card, Space, Table, Tag, App } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { SwimmerListItem } from '@swim/shared';
import { useSwimmers, useSetMembership } from '../../lib/queries';
import { CreateSwimmerModal } from './CreateSwimmerModal';
import { ClaimLinkButton } from './ClaimLinkButton';

export function RosterTable({ poolId }: { poolId: string }) {
  const swimmers = useSwimmers(poolId);
  const setMembership = useSetMembership(poolId);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { message } = App.useApp();

  const toggle = async (r: SwimmerListItem) => {
    const next = r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try { await setMembership.mutateAsync({ sid: r.swimmerId, body: { status: next } }); }
    catch (e: any) { message.error(e?.response?.data?.message ?? '操作失败'); }
  };

  const columns = [
    { title: '姓名', dataIndex: 'name', render: (v: string | null) => v ?? '—' },
    { title: '邮箱', dataIndex: 'email' },
    { title: '状态', dataIndex: 'status', render: (s: string) => <Tag color={s === 'ACTIVE' ? 'green' : 'default'}>{s === 'ACTIVE' ? '活跃' : '停用'}</Tag> },
    { title: '近30天里程(米)', dataIndex: 'mileageLast30dMeters' },
    {
      title: '操作', key: 'op',
      render: (_: unknown, r: SwimmerListItem) => (
        <Space>
          <Button size="small" onClick={(e) => { e.stopPropagation(); toggle(r); }}>
            {r.status === 'ACTIVE' ? '停用' : '恢复'}
          </Button>
          <ClaimLinkButton poolId={poolId} sid={r.swimmerId} claimed={!!r.claimedAt} />
        </Space>
      ),
    },
  ];

  return (
    <Card title="会员名册" extra={<Button type="primary" onClick={() => setOpen(true)}>新建会员</Button>}>
      <Table<SwimmerListItem>
        rowKey="swimmerId" loading={swimmers.isLoading} dataSource={swimmers.data ?? []} columns={columns}
        onRow={(r) => ({ onClick: () => navigate(`/pools/${poolId}/swimmers/${r.swimmerId}`), style: { cursor: 'pointer' } })}
        locale={{ emptyText: '还没有会员，点击"新建会员"添加' }}
      />
      <CreateSwimmerModal poolId={poolId} open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}
