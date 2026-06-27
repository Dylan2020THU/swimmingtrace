import { Card } from 'antd-mobile';
import HeatMap from '@uiw/react-heat-map';
import type { HeatmapCell } from '@swim/shared';

export function HeatmapCard({ cells, year }: { cells: HeatmapCell[]; year: number }) {
  const value = cells.map((c) => ({ date: c.date.replace(/-/g, '/'), count: c.distanceMeters }));
  return (
    <Card title="活跃热力图">
      <HeatMap value={value} startDate={new Date(`${year}/01/01`)} width={340} rectSize={9} legendCellSize={0} />
    </Card>
  );
}
