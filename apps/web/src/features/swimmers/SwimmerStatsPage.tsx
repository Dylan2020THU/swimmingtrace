import { Card, Col, Row, Skeleton, Space, Statistic } from 'antd';
import { useParams } from 'react-router-dom';
import { useSwimmerStats } from '../../lib/queries';
import { HeatmapCard } from '../dashboard/HeatmapCard';

/** Read-only, pool-agnostic member training view (heatmap + totals). Reached from any member table. */
export function SwimmerStatsPage() {
  const { sid = '' } = useParams();
  const stats = useSwimmerStats(sid);
  if (!stats.data) return <Skeleton active />;
  const s = stats.data.summary;
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title="会员训练概览">
        <Row gutter={16}>
          <Col span={8}><Statistic title="总里程(米)" value={s.totalDistanceMeters} formatter={(v) => String(v)} /></Col>
          <Col span={8}><Statistic title="游泳次数" value={s.sessionCount} formatter={(v) => String(v)} /></Col>
          <Col span={8}><Statistic title="总时长(秒)" value={s.totalDurationSeconds} formatter={(v) => String(v)} /></Col>
        </Row>
      </Card>
      <HeatmapCard cells={stats.data.heatmap} />
    </Space>
  );
}
