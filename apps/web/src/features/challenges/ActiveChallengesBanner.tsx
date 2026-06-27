import { Card, List, Progress } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useActiveChallenges } from '../../lib/queries';

const pct = (total: number, goal: number) => Math.min(100, Math.round((total / Math.max(1, goal)) * 100));

/** "Event mode" surface: shows the owner's running challenges across pools, or nothing when none are active. */
export function ActiveChallengesBanner() {
  const active = useActiveChallenges();
  const data = active.data ?? [];
  const navigate = useNavigate();

  if (data.length === 0) return null;

  return (
    <Card title="🏊 进行中的挑战">
      <List
        dataSource={data}
        renderItem={(c) => (
          <List.Item onClick={() => navigate(`/pools/${c.poolId}/challenges/${c.id}`)} style={{ cursor: 'pointer' }}>
            <List.Item.Meta title={`${c.poolName} · ${c.name}`} />
            <div style={{ width: 200 }}>
              <Progress percent={pct(c.totalDistanceMeters, c.goalDistanceMeters)} size="small" />
              <div style={{ fontSize: 12, color: '#999' }}>{c.totalDistanceMeters} / {c.goalDistanceMeters} 米</div>
            </div>
          </List.Item>
        )}
      />
    </Card>
  );
}
