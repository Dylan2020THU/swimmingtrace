import { Card, Grid } from 'antd-mobile';
import type { SwimmerStats } from '@swim/shared';

export function SummaryCards({ summary }: { summary: SwimmerStats['summary'] }) {
  const items = [
    { title: '总里程(米)', value: summary.totalDistanceMeters },
    { title: '游泳次数', value: summary.sessionCount },
    { title: '总时长(秒)', value: summary.totalDurationSeconds },
  ];
  return (
    <Grid columns={3} gap={8}>
      {items.map((it) => (
        <Grid.Item key={it.title}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{it.value}</div>
              <div style={{ color: '#999', fontSize: 12 }}>{it.title}</div>
            </div>
          </Card>
        </Grid.Item>
      ))}
    </Grid>
  );
}
