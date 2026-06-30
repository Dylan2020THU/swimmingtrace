import { DotLoading, ErrorBlock, List, Tag } from 'antd-mobile';
import { useMyRecords } from '../../lib/queries';
import { STROKE_LABELS, formatSwimTime } from '../../lib/swim-time';

export function MyRecordsPage() {
  const records = useMyRecords();
  const data = records.data ?? [];

  if (records.isError) return <ErrorBlock status="default" title="加载失败" description="请稍后重试" />;
  if (records.isLoading) return <div style={{ padding: 16, textAlign: 'center' }}><DotLoading /></div>;
  if (data.length === 0) return <ErrorBlock status="empty" title="暂无成绩" description="完赛后这里会显示你每个项目的最好成绩（PB）。" />;

  return (
    <div>
      <h2 style={{ margin: '0 0 8px' }}>我的成绩</h2>
      <List>
        {data.map((p) => (
          <List.Item key={`${p.distanceMeters}-${p.stroke}`} extra={formatSwimTime(p.timeMs)} description={p.meetName}>
            {p.distanceMeters}m {STROKE_LABELS[p.stroke]}
            {p.isClubRecord && <Tag color="warning" style={{ marginLeft: 8 }}>🏆 赛会纪录</Tag>}
          </List.Item>
        ))}
      </List>
    </div>
  );
}
