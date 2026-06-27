import { useState } from 'react';
import { Button, Card, Form, Modal, Space, Table, Skeleton, App } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { PoolSummary } from '@swim/shared';
import { useOverview, usePools, useCreatePool } from '../../lib/queries';
import { StatCards } from '../dashboard/StatCards';
import { PoolForm } from './PoolForm';
import { ActiveChallengesBanner } from '../challenges/ActiveChallengesBanner';

export function OverviewPage() {
  const overview = useOverview();
  const pools = usePools();
  const createPool = useCreatePool();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { message } = App.useApp();

  const submit = async (v: any) => {
    try {
      await createPool.mutateAsync(v);
      setOpen(false); form.resetFields();
    } catch (e: any) { message.error(e?.response?.data?.message ?? '创建失败'); }
  };

  const columns = [
    { title: '名称', dataIndex: 'name' },
    { title: '会员数', dataIndex: 'memberCount' },
    { title: '近30天里程(米)', dataIndex: 'mileageLast30dMeters' },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <ActiveChallengesBanner />
      {overview.data ? <StatCards stats={overview.data} /> : <Skeleton active />}
      <Card
        title="我的泳池"
        extra={<Button type="primary" onClick={() => setOpen(true)}>新建泳池</Button>}
      >
        <Table<PoolSummary>
          rowKey="id" loading={pools.isLoading} dataSource={pools.data ?? []} columns={columns}
          onRow={(r) => ({ onClick: () => navigate(`/pools/${r.id}`), style: { cursor: 'pointer' } })}
          locale={{ emptyText: '还没有泳池，点击"新建泳池"创建第一个' }}
        />
      </Card>
      <Modal title="新建泳池" open={open} onOk={() => form.submit()} onCancel={() => setOpen(false)} confirmLoading={createPool.isPending} okText="确定" okButtonProps={{ autoInsertSpace: false }}>
        <PoolForm form={form} onFinish={submit} />
      </Modal>
    </Space>
  );
}
