import { useMemo, useState } from 'react';
import { Button, Card, Input, Popconfirm, Progress, Result, Select, Skeleton, Space, Table, Tag, App } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { AGE_GROUPS, ageGroupOf, type LeaderboardRow } from '@swim/shared';
import { useChallenge, useDeleteChallenge } from '../../lib/queries';

const GENDER_LABEL: Record<string, string> = { MALE: '男', FEMALE: '女' };

export function ChallengeDetailPage() {
  const { poolId = '', cid = '' } = useParams();
  const challenge = useChallenge(cid);
  const del = useDeleteChallenge(poolId);
  const navigate = useNavigate();
  const { message } = App.useApp();

  const [fGender, setFGender] = useState<string>();
  const [fAge, setFAge] = useState<string>();
  const [fStatus, setFStatus] = useState<string>();
  const [q, setQ] = useState('');

  const board = challenge.data?.leaderboard ?? [];
  const rankOf = useMemo(() => new Map(board.map((r, i) => [r.swimmerId, i + 1])), [board]);
  const ageOf = (r: LeaderboardRow) => (r.birthDate ? ageGroupOf(new Date(r.birthDate), new Date()) : null);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return board.filter((r) => {
      if (fGender && r.gender !== fGender) return false;
      if (fStatus && r.status !== fStatus) return false;
      if (fAge && ageOf(r) !== fAge) return false;
      if (needle && !`${r.name ?? ''} ${r.email}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [board, fGender, fStatus, fAge, q]);

  if (challenge.isError) {
    return (
      <Result
        status="404"
        title="挑战不存在或无权访问"
        extra={<Button type="primary" onClick={() => navigate(`/pools/${poolId}`)}>返回泳池</Button>}
      />
    );
  }
  if (!challenge.data) return <Skeleton active />;
  const c = challenge.data;
  const pct = Math.min(100, Math.round((c.totalDistanceMeters / Math.max(1, c.goalDistanceMeters)) * 100));
  const total = c.totalDistanceMeters;

  const remove = async () => {
    try {
      await del.mutateAsync(cid);
      navigate(`/pools/${poolId}`);
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? '删除失败');
    }
  };

  const columns = [
    { title: '名次', key: 'rank', width: 64, render: (_: unknown, r: LeaderboardRow) => rankOf.get(r.swimmerId) },
    { title: '姓名', dataIndex: 'name', render: (v: string | null) => v ?? '—' },
    { title: '性别', dataIndex: 'gender', width: 64, render: (g: string | null) => (g ? GENDER_LABEL[g] : '—') },
    { title: '年龄组', key: 'age', width: 90, render: (_: unknown, r: LeaderboardRow) => ageOf(r) ?? '—' },
    { title: '状态', dataIndex: 'status', width: 80, render: (s: string) => <Tag color={s === 'ACTIVE' ? 'green' : 'default'}>{s === 'ACTIVE' ? '活跃' : '停用'}</Tag> },
    { title: '游泳次数', dataIndex: 'sessionCount', width: 90 },
    { title: '里程(米)', dataIndex: 'distanceMeters' },
    { title: '里程占比', key: 'pct', width: 90, render: (_: unknown, r: LeaderboardRow) => `${total > 0 ? Math.round((r.distanceMeters / total) * 100) : 0}%` },
    { title: '邮箱', dataIndex: 'email' },
    {
      title: '操作', key: 'op', width: 120,
      render: (_: unknown, r: LeaderboardRow) => (
        <Button size="small" onClick={() => navigate(`/swimmers/${r.swimmerId}`)}>个人泳迹图</Button>
      ),
    },
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
        <Space wrap style={{ marginBottom: 12 }}>
          <Select aria-label="性别" style={{ width: 100 }} value={fGender ?? ''} onChange={(v) => setFGender(v || undefined)}
            options={[{ value: '', label: '全部性别' }, { value: 'MALE', label: '男' }, { value: 'FEMALE', label: '女' }]} />
          <Select aria-label="年龄组" style={{ width: 130 }} value={fAge ?? ''} onChange={(v) => setFAge(v || undefined)}
            options={[{ value: '', label: '全部年龄组' }, ...AGE_GROUPS.map((b) => ({ value: b.label, label: b.label }))]} />
          <Select aria-label="状态" style={{ width: 100 }} value={fStatus ?? ''} onChange={(v) => setFStatus(v || undefined)}
            options={[{ value: '', label: '全部状态' }, { value: 'ACTIVE', label: '活跃' }, { value: 'INACTIVE', label: '停用' }]} />
          <Input.Search placeholder="姓名/邮箱" allowClear style={{ width: 200 }} value={q} onChange={(e) => setQ(e.target.value)} />
        </Space>
        <Table<LeaderboardRow>
          rowKey="swimmerId"
          dataSource={filtered}
          columns={columns}
          pagination={false}
          locale={{ emptyText: '窗口内还没有游泳记录' }}
        />
      </Card>
    </Space>
  );
}
