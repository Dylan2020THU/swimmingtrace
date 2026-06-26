import { Card } from 'antd';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HeatmapCell } from '@swim/shared';

export function TrendChart({ cells }: { cells: HeatmapCell[] }) {
  return (
    <Card title="里程趋势">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={cells}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" /><YAxis /><Tooltip />
          <Line type="monotone" dataKey="distanceMeters" stroke="#1677ff" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
