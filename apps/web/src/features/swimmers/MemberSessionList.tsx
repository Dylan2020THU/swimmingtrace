import { useMemo } from 'react';
import { Button, Divider, Empty, List, Skeleton, Space, Typography } from 'antd';
import dayjs from 'dayjs';
import type { MemberSessionRow } from '@swim/shared';

const fmtDuration = (s: number | null) => {
  if (s == null) return null;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}分${sec}秒` : `${sec}秒`;
};

/** GitHub-contribution-activity-style training detail: sessions grouped by month (reverse-chron). */
export function MemberSessionList({
  sessions,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  sessions: MemberSessionRow[];
  isLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}) {
  // Group by YYYY-MM regardless of arrival order (robust across pagination), months descending.
  const groups = useMemo(() => {
    const map = new Map<string, MemberSessionRow[]>();
    for (const s of sessions) {
      const month = dayjs(s.swamAt).format('YYYY-MM');
      const arr = map.get(month);
      if (arr) arr.push(s);
      else map.set(month, [s]);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, rows]) => ({ month, rows }));
  }, [sessions]);

  if (isLoading) return <Skeleton active />;
  if (!sessions.length) return <Empty description="该年度暂无训练记录" />;

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {groups.map((g) => {
        const dist = g.rows.reduce((a, r) => a + r.distanceMeters, 0);
        return (
          <div key={g.month}>
            <Divider orientation="left" style={{ margin: '8px 0' }}>
              {dayjs(`${g.month}-01`).format('YYYY年M月')} · {g.rows.length} 次 · {dist} 米
            </Divider>
            <List
              size="small"
              rowKey="id"
              dataSource={g.rows}
              renderItem={(s) => (
                <List.Item>
                  <Space wrap>
                    <span>{dayjs(s.swamAt).format('MM-DD')}</span>
                    {s.poolName && <Typography.Text type="secondary">{s.poolName}</Typography.Text>}
                    <b>{s.distanceMeters} 米</b>
                    {fmtDuration(s.durationSeconds) && <Typography.Text type="secondary">{fmtDuration(s.durationSeconds)}</Typography.Text>}
                  </Space>
                </List.Item>
              )}
            />
          </div>
        );
      })}
      {hasNextPage && (
        <Button block loading={isFetchingNextPage} onClick={onLoadMore}>加载更多</Button>
      )}
    </Space>
  );
}
