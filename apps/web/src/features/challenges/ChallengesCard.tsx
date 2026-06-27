import { useState } from 'react';
import { Button, Card, Form, List, Modal, Progress, App } from 'antd';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import type { CreateChallengeDto } from '@swim/shared';
import { usePoolChallenges, useCreateChallenge } from '../../lib/queries';
import { ChallengeForm } from './ChallengeForm';

const pct = (total: number, goal: number) => Math.min(100, Math.round((total / Math.max(1, goal)) * 100));

export function ChallengesCard({ poolId }: { poolId: string }) {
  const challenges = usePoolChallenges(poolId);
  const create = useCreateChallenge(poolId);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { message } = App.useApp();

  const submit = async (dto: CreateChallengeDto) => {
    try {
      await create.mutateAsync(dto);
      setOpen(false);
      form.resetFields();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? '创建失败');
    }
  };

  return (
    <Card title="挑战" extra={<Button type="primary" onClick={() => setOpen(true)}>新建挑战</Button>}>
      <List
        loading={challenges.isLoading}
        dataSource={challenges.data ?? []}
        locale={{ emptyText: '还没有挑战，点击"新建挑战"发起一个' }}
        renderItem={(c) => (
          <List.Item
            onClick={() => navigate(`/pools/${poolId}/challenges/${c.id}`)}
            style={{ cursor: 'pointer' }}
            actions={[<a key="v">查看排行榜</a>]}
          >
            <List.Item.Meta
              title={c.name}
              description={`${dayjs(c.startDate).format('YYYY-MM-DD')} ~ ${dayjs(c.endDate).format('YYYY-MM-DD')}`}
            />
            <div style={{ width: 180 }}>
              <Progress percent={pct(c.totalDistanceMeters, c.goalDistanceMeters)} size="small" />
              <div style={{ fontSize: 12, color: '#999' }}>{c.totalDistanceMeters} / {c.goalDistanceMeters} 米</div>
            </div>
          </List.Item>
        )}
      />
      <Modal title="新建挑战" open={open} onOk={() => form.submit()} onCancel={() => setOpen(false)} confirmLoading={create.isPending} okText="创建">
        <ChallengeForm form={form} onFinish={submit} />
      </Modal>
    </Card>
  );
}
