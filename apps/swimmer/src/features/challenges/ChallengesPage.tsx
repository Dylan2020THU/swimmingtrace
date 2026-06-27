import { Card, DotLoading, ErrorBlock, ProgressBar } from 'antd-mobile';
import dayjs from 'dayjs';
import { useMyChallenges } from '../../lib/queries';

export function ChallengesPage() {
  const challenges = useMyChallenges();
  const data = challenges.data ?? [];

  if (challenges.isError) {
    return <ErrorBlock status="default" title="加载失败" description="请稍后重试" />;
  }
  if (challenges.isLoading) {
    return <div style={{ padding: 16, textAlign: 'center' }}><DotLoading /></div>;
  }
  if (data.length === 0) {
    return <ErrorBlock status="empty" title="暂无进行中的挑战" description="你所属泳池目前没有进行中的挑战。" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {data.map((c) => {
        const pct = Math.min(100, Math.round((c.totalDistanceMeters / Math.max(1, c.goalDistanceMeters)) * 100));
        return (
          <Card key={c.id} title={`${c.poolName} · ${c.name}`}>
            <div style={{ fontSize: 12, color: '#999' }}>
              {dayjs(c.startDate).format('MM-DD')} ~ {dayjs(c.endDate).format('MM-DD')}
            </div>
            <ProgressBar percent={pct} />
            <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
              池进度 {c.totalDistanceMeters} / {c.goalDistanceMeters} 米
            </div>
            <div style={{ marginTop: 8 }}>
              我的里程 <b>{c.myDistanceMeters}</b> 米 · 名次 <b>{c.myRank ?? '—'}</b>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
