import { useState } from 'react';
import { App, Button, Card, Form, Input, Modal, Select, Table } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { MeetSummary } from '@swim/shared';
import { useMeets, useCreateMeet, usePools } from '../../lib/queries';

export function MeetsListPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const meets = useMeets();
  const pools = usePools();
  const create = useCreateMeet();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const submit = async (v: { name: string; meetDate: string; hostPoolId?: string }) => {
    try {
      await create.mutateAsync({ name: v.name, meetDate: new Date(v.meetDate).toISOString(), hostPoolId: v.hostPoolId ?? null });
      form.resetFields();
      setOpen(false);
      message.success('赛事已创建');
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? '创建失败');
    }
  };

  const columns = [
    { title: '赛事', dataIndex: 'name' },
    { title: '日期', dataIndex: 'meetDate', render: (d: string) => new Date(d).toLocaleDateString() },
    { title: '主办泳池', dataIndex: 'hostPoolName', render: (v: string | null) => v ?? '—' },
    { title: '项目数', dataIndex: 'eventCount' },
  ];

  return (
    <Card title="赛事" extra={<Button type="primary" onClick={() => setOpen(true)}>新建赛事</Button>}>
      <Table<MeetSummary>
        rowKey="id"
        loading={meets.isLoading}
        dataSource={meets.data ?? []}
        columns={columns}
        onRow={(r) => ({ onClick: () => navigate(`/meets/${r.id}`), style: { cursor: 'pointer' } })}
        locale={{ emptyText: '还没有赛事，点击"新建赛事"创建' }}
      />
      <Modal title="新建赛事" open={open} onOk={() => form.submit()} onCancel={() => setOpen(false)} confirmLoading={create.isPending} okText="创建">
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="name" label="赛事名称" rules={[{ required: true, message: '请输入名称' }]}><Input /></Form.Item>
          <Form.Item name="meetDate" label="日期" rules={[{ required: true, message: '请选择日期' }]}><Input type="date" /></Form.Item>
          <Form.Item name="hostPoolId" label="主办泳池（场地，可选）">
            <Select allowClear placeholder="可选" options={(pools.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
