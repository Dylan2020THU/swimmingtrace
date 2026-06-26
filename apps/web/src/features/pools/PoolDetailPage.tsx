import { useState } from 'react';
import { Button, Card, Descriptions, Form, Modal, Popconfirm, Skeleton, Space, App } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { usePool, useUpdatePool, useArchivePool } from '../../lib/queries';
import { PoolForm } from './PoolForm';

export function PoolDetailPage() {
  const { poolId = '' } = useParams();
  const pool = usePool(poolId);
  const updatePool = useUpdatePool(poolId);
  const archivePool = useArchivePool();
  const [editOpen, setEditOpen] = useState(false);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { message } = App.useApp();

  if (!pool.data) return <Skeleton active />;
  const p = pool.data;

  const submitEdit = async (v: any) => {
    try { await updatePool.mutateAsync(v); setEditOpen(false); }
    catch (e: any) { message.error(e?.response?.data?.message ?? '更新失败'); }
  };
  const archive = async () => {
    try { await archivePool.mutateAsync(poolId); navigate('/pools'); }
    catch (e: any) { message.error(e?.response?.data?.message ?? '归档失败'); }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        title={p.name}
        extra={
          <Space>
            <Button autoInsertSpace={false} onClick={() => { form.setFieldsValue(p); setEditOpen(true); }}>编辑</Button>
            <Popconfirm title="归档该泳池？" description="归档后将从列表隐藏（历史数据保留）。" onConfirm={archive} okText="确定" cancelText="取消">
              <Button danger autoInsertSpace={false}>归档</Button>
            </Popconfirm>
          </Space>
        }
      >
        <Descriptions column={2}>
          <Descriptions.Item label="地址">{p.address ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="会员数">{p.memberCount}</Descriptions.Item>
          <Descriptions.Item label="状态">{p.archivedAt ? '已归档' : '使用中'}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 会员名册：Task 10 填充 */}
      {/* 本泳池看板：Task 11 填充 */}

      <Modal title="编辑泳池" open={editOpen} onOk={() => form.submit()} onCancel={() => setEditOpen(false)} confirmLoading={updatePool.isPending} okText="保存">
        <PoolForm form={form} onFinish={submitEdit} />
      </Modal>
    </Space>
  );
}
