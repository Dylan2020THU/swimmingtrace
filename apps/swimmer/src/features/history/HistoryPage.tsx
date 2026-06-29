import { Button, Card, List, DotLoading } from 'antd-mobile';
import dayjs from 'dayjs';
import { useMySessions } from '../../lib/queries';

export function HistoryPage() {
  const q = useMySessions();
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Card title="我的游泳历史">
      {q.isLoading ? (
        <div style={{ padding: 16, textAlign: 'center' }}>
          <DotLoading />
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: 16, color: '#999' }}>还没有记录，去「看板」记录第一次游泳吧</div>
      ) : (
        <>
          <List>
            {items.map((s) => (
              <List.Item
                key={s.id}
                description={`${dayjs(s.swamAt).format('YYYY-MM-DD')}${s.durationSeconds ? ` · ${s.durationSeconds} 秒` : ''}`}
              >
                {s.distanceMeters} 米
              </List.Item>
            ))}
          </List>
          {q.hasNextPage && (
            <div style={{ padding: 12, textAlign: 'center' }}>
              <Button block loading={q.isFetchingNextPage} onClick={() => { q.fetchNextPage(); }}>
                加载更多
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
