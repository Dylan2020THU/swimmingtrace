import { Card } from 'antd';
import type { ReactNode } from 'react';
import HeatMap from '@uiw/react-heat-map';
import type { HeatmapCell } from '@swim/shared';

export function HeatmapCard({ cells, year = new Date().getUTCFullYear(), extra }: { cells: HeatmapCell[]; year?: number; extra?: ReactNode }) {
  const value = cells.map((c) => ({ date: c.date.replace(/-/g, '/'), count: c.distanceMeters }));
  return (
    <Card title="活动热力图" extra={extra}>
      <HeatMap
        value={value}
        startDate={new Date(`${year}/01/01`)}
        endDate={new Date(`${year}/12/31`)}
        width={760}
        rectSize={11}
      />
    </Card>
  );
}
