import { useState } from 'react';
import { App, Button, Card, Form, Input, Modal, Popconfirm, Table, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { SeasonSummary } from '@swim/shared';
import { useCreateSeason, useDeleteSeason, useSeasons } from '../../lib/queries';

export function SeasonsListPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const seasons = useSeasons();
  const create = useCreateSeason();
  const del = useDeleteSeason();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const submit = async (v: { name: string; referenceDate: string }) => {
    try {
      await create.mutateAsync({ name: v.name, referenceDate: new Date(v.referenceDate).toISOString() });
      form.resetFields();
      setOpen(false);
      message.success('赛季已创建');
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? '创建失败');
    }
  };

  const remove = async (id: string) => {
    try {
      await del.mutateAsync(id);
      message.success('已删除');
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? '删除失败');
    }
  };

  return (
    <Card title="赛季 / 系列赛" extra={<Button type="primary" onClick={() => setOpen(true)}>新建赛季</Button>}>
      <Table<SeasonSummary>
        rowKey="id"
        loading={seasons.isLoading}
        dataSource={seasons.data ?? []}
        locale={{ emptyText: '还没有赛季，点击"新建赛季"创建' }}
        onRow={(r) => ({ onClick: () => navigate(`/seasons/${r.id}`), style: { cursor: 'pointer' } })}
        columns={[
          { title: '赛季', dataIndex: 'name' },
          { title: '年龄基准日', dataIndex: 'referenceDate', render: (d: string) => new Date(d).toLocaleDateString() },
          { title: '赛事数', dataIndex: 'meetCount' },
          { title: '公开', dataIndex: 'published', render: (p: boolean) => (p ? <Tag color="green">已公开</Tag> : <Tag>未公开</Tag>) },
          {
            title: '操作',
            render: (_: unknown, r: SeasonSummary) => (
              <Popconfirm title="删除该赛季？归属赛事将移出（成绩不受影响）" onConfirm={() => remove(r.id)}>
                <Button size="small" danger onClick={(e) => e.stopPropagation()}>删除</Button>
              </Popconfirm>
            ),
          },
        ]}
      />
      <Modal title="新建赛季" open={open} onOk={() => form.submit()} onCancel={() => setOpen(false)} confirmLoading={create.isPending} okText="创建">
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="name" label="赛季名称" rules={[{ required: true, message: '请输入名称' }]}><Input /></Form.Item>
          <Form.Item name="referenceDate" label="年龄基准日" rules={[{ required: true, message: '请选择基准日' }]} extra="赛季内统一以此日计算年龄组">
            <Input type="date" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
