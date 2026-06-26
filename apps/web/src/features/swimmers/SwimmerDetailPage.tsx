import { useState } from 'react';
import { Button, Card, Col, Row, Skeleton, Space, Statistic } from 'antd';
import { useParams } from 'react-router-dom';
import { useSwimmerStats } from '../../lib/queries';
import { HeatmapCard } from '../dashboard/HeatmapCard';
import { RecordSessionModal } from '../sessions/RecordSessionModal';

export function SwimmerDetailPage() {
  const { poolId = '', sid = '' } = useParams();
  const stats = useSwimmerStats(sid);
  const [open, setOpen] = useState(false);
  if (!stats.data) return <Skeleton active />;
  const s = stats.data.summary;
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title="游泳者" extra={<Button type="primary" autoInsertSpace={false} onClick={() => setOpen(true)}>代录</Button>}>
        <Row gutter={16}>
          <Col span={8}><Statistic title="总里程(米)" value={s.totalDistanceMeters} formatter={(v) => String(v)} /></Col>
          <Col span={8}><Statistic title="游泳次数" value={s.sessionCount} formatter={(v) => String(v)} /></Col>
          <Col span={8}><Statistic title="总时长(秒)" value={s.totalDurationSeconds} formatter={(v) => String(v)} /></Col>
        </Row>
      </Card>
      <HeatmapCard cells={stats.data.heatmap} />
      <RecordSessionModal poolId={poolId} sid={sid} open={open} onClose={() => setOpen(false)} />
    </Space>
  );
}
