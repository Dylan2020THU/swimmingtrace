import { useState } from 'react';
import { Button, Card, Input, Select, Space, Table, Tag, App } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ageGroupOf, type SwimmerListItem } from '@swim/shared';
import { useSwimmers, useSetMembership } from '../../lib/queries';
import { CreateSwimmerModal } from './CreateSwimmerModal';
import { ClaimLinkButton } from './ClaimLinkButton';

const GENDER_LABEL: Record<string, string> = { MALE: '男', FEMALE: '女' };

export function RosterTable({ poolId }: { poolId: string }) {
  const [page, setPage] = useState(1);
  const [gender, setGender] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [q, setQ] = useState<string>();
  const swimmers = useSwimmers(poolId, page, { gender, status, q });
  const setMembership = useSetMembership(poolId);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { message } = App.useApp();

  // Any filter change resets to the first page (server-side pagination). '' (全部) clears the filter.
  const onFilter = (set: (v: string | undefined) => void) => (v: string) => { set(v || undefined); setPage(1); };

  const toggle = async (r: SwimmerListItem) => {
    const next = r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try { await setMembership.mutateAsync({ sid: r.swimmerId, body: { status: next } }); }
    catch (e: any) { message.error(e?.response?.data?.message ?? '操作失败'); }
  };

  const columns = [
    { title: '姓名', dataIndex: 'name', render: (v: string | null) => v ?? '—' },
    { title: '性别', dataIndex: 'gender', width: 64, render: (g: string | null) => (g ? GENDER_LABEL[g] : '—') },
    { title: '年龄组', key: 'age', width: 90, render: (_: unknown, r: SwimmerListItem) => (r.birthDate ? ageGroupOf(new Date(r.birthDate), new Date()) : '—') },
    { title: '邮箱', dataIndex: 'email' },
    { title: '状态', dataIndex: 'status', width: 80, render: (s: string) => <Tag color={s === 'ACTIVE' ? 'green' : 'default'}>{s === 'ACTIVE' ? '活跃' : '停用'}</Tag> },
    { title: '近30天里程(米)', dataIndex: 'mileageLast30dMeters', width: 130 },
    {
      title: '操作', key: 'op',
      render: (_: unknown, r: SwimmerListItem) => (
        <Space>
          <Button size="small" onClick={(e) => { e.stopPropagation(); navigate(`/swimmers/${r.swimmerId}`); }}>个人泳迹图</Button>
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
      <Space wrap style={{ marginBottom: 12 }}>
        <Select aria-label="性别" style={{ width: 100 }} value={gender ?? ''} onChange={onFilter(setGender)}
          options={[{ value: '', label: '全部性别' }, { value: 'MALE', label: '男' }, { value: 'FEMALE', label: '女' }]} />
        <Select aria-label="状态" style={{ width: 100 }} value={status ?? ''} onChange={onFilter(setStatus)}
          options={[{ value: '', label: '全部状态' }, { value: 'ACTIVE', label: '活跃' }, { value: 'INACTIVE', label: '停用' }]} />
        <Input.Search placeholder="姓名/邮箱" allowClear style={{ width: 220 }} onSearch={(v) => { setQ(v || undefined); setPage(1); }} />
      </Space>
      <Table<SwimmerListItem>
        rowKey="swimmerId" loading={swimmers.isLoading} dataSource={swimmers.data?.items ?? []} columns={columns}
        pagination={{ current: page, pageSize: 20, total: swimmers.data?.total ?? 0, onChange: setPage }}
        locale={{ emptyText: '没有匹配的会员' }}
      />
      <CreateSwimmerModal poolId={poolId} open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}
