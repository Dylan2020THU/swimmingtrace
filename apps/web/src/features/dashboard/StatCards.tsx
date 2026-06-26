import { Card, Col, Row, Statistic } from 'antd';
import type { OverviewStats } from '@swim/shared';

export function StatCards({ stats }: { stats: OverviewStats }) {
  const items = [
    { title: '泳池数', value: stats.poolCount },
    { title: '会员总数', value: stats.memberCount },
    { title: '活跃会员', value: stats.activeMemberCount },
    { title: '本月里程(米)', value: stats.mileageThisMonthMeters },
  ];
  return (
    <Row gutter={16}>
      {items.map((it) => (
        <Col span={6} key={it.title}>
          <Card>
            <Statistic title={it.title} value={it.value} formatter={(v) => String(v)} />
          </Card>
        </Col>
      ))}
    </Row>
  );
}
