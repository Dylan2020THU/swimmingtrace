import { Card, List } from 'antd-mobile';
import dayjs from 'dayjs';
import { useMySessions } from '../../lib/queries';

export function HistoryPage() {
  const sessions = useMySessions();
  const data = sessions.data ?? [];
  return (
    <Card title="我的游泳历史">
      {data.length === 0 ? (
        <div style={{ padding: 16, color: '#999' }}>还没有记录，去「看板」记录第一次游泳吧</div>
      ) : (
        <List>
          {data.map((s) => (
            <List.Item key={s.id} description={dayjs(s.swamAt).format('YYYY-MM-DD')} extra={`${s.distanceMeters} 米`}>
              {s.durationSeconds ? `${s.durationSeconds} 秒` : '—'}
            </List.Item>
          ))}
        </List>
      )}
    </Card>
  );
}
