import { Button, DotLoading, ErrorBlock } from 'antd-mobile';
import { useNavigate } from 'react-router-dom';
import { useMySummary, useMyHeatmap } from '../../lib/queries';
import { SummaryCards } from './SummaryCards';
import { HeatmapCard } from './HeatmapCard';

export function DashboardPage() {
  const summary = useMySummary();
  const year = new Date().getFullYear();
  const heatmap = useMyHeatmap(year);
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {summary.isError ? (
        <ErrorBlock status="default" title="加载失败" description="请稍后重试" />
      ) : summary.data ? (
        <SummaryCards summary={summary.data} />
      ) : (
        <div style={{ padding: 16, textAlign: 'center' }}>
          <DotLoading />
        </div>
      )}
      <Button block color="primary" size="large" onClick={() => navigate('/record')}>
        记录一次游泳
      </Button>
      <HeatmapCard cells={heatmap.data ?? []} year={year} />
    </div>
  );
}
