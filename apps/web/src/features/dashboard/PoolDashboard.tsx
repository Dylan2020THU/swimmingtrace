import { Card, Col, Row, Skeleton, Space, Statistic } from 'antd';
import { usePoolStats } from '../../lib/queries';
import { HeatmapCard } from './HeatmapCard';
import { TrendChart } from './TrendChart';

export function PoolDashboard({ poolId }: { poolId: string }) {
  const stats = usePoolStats(poolId);
  if (!stats.data) return <Skeleton active />;
  const s = stats.data;
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Row gutter={16}>
        <Col span={8}><Card><Statistic title="会员数" value={s.memberCount} formatter={(v) => String(v)} /></Card></Col>
        <Col span={8}><Card><Statistic title="活跃会员" value={s.activeMemberCount} formatter={(v) => String(v)} /></Card></Col>
        <Col span={8}><Card><Statistic title="本月里程(米)" value={s.mileageThisMonthMeters} formatter={(v) => String(v)} /></Card></Col>
      </Row>
      <TrendChart cells={s.trend} />
      <HeatmapCard cells={s.heatmap} />
    </Space>
  );
}
