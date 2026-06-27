import { Button, Card, Popconfirm, Progress, Skeleton, Space, Table, App } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import type { LeaderboardRow } from '@swim/shared';
import { useChallenge, useDeleteChallenge } from '../../lib/queries';

export function ChallengeDetailPage() {
  const { poolId = '', cid = '' } = useParams();
  const challenge = useChallenge(cid);
  const del = useDeleteChallenge(poolId);
  const navigate = useNavigate();
  const { message } = App.useApp();

  if (!challenge.data) return <Skeleton active />;
  const c = challenge.data;
  const pct = Math.min(100, Math.round((c.totalDistanceMeters / Math.max(1, c.goalDistanceMeters)) * 100));

  const remove = async () => {
    try {
      await del.mutateAsync(cid);
      navigate(`/pools/${poolId}`);
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? '删除失败');
    }
  };

  const columns = [
    { title: '名次', key: 'rank', width: 64, render: (_: unknown, __: LeaderboardRow, i: number) => i + 1 },
    { title: '姓名', dataIndex: 'name', render: (v: string | null) => v ?? '—' },
    { title: '邮箱', dataIndex: 'email' },
    { title: '里程(米)', dataIndex: 'distanceMeters' },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        title={c.name}
        extra={
          <Popconfirm title="删除该挑战？" onConfirm={remove} okText="确定" cancelText="取消">
            <Button danger autoInsertSpace={false}>删除</Button>
          </Popconfirm>
        }
      >
        <div style={{ marginBottom: 8 }}>{dayjs(c.startDate).format('YYYY-MM-DD')} ~ {dayjs(c.endDate).format('YYYY-MM-DD')}</div>
        <Progress percent={pct} />
        <div style={{ color: '#999' }}>{c.totalDistanceMeters} / {c.goalDistanceMeters} 米</div>
      </Card>
      <Card title="排行榜">
        <Table<LeaderboardRow>
          rowKey="swimmerId"
          dataSource={c.leaderboard}
          columns={columns}
          pagination={false}
          locale={{ emptyText: '窗口内还没有游泳记录' }}
        />
      </Card>
    </Space>
  );
}
