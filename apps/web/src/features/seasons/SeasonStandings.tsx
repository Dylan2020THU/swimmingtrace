import { Card, Empty, Space, Table } from 'antd';
import type { SeasonStandingsGroup } from '@swim/shared';

const GENDER_LABEL: Record<string, string> = { MALE: '男', FEMALE: '女' };

/** Season points leaderboard grouped by gender × age group. Shared by owner + public pages. */
export function SeasonStandings({ groups }: { groups: SeasonStandingsGroup[] }) {
  if (!groups.length) return <Empty description="暂无积分（赛季内尚无成绩）" />;
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {groups.map((g) => (
        <Card key={`${g.gender}-${g.ageGroup}`} size="small" title={`${GENDER_LABEL[g.gender]} · ${g.ageGroup}`}>
          <Table
            rowKey="swimmerId"
            size="small"
            pagination={false}
            dataSource={g.rows}
            columns={[
              { title: '名次', dataIndex: 'rank', width: 70 },
              { title: '姓名', dataIndex: 'name', render: (v: string | null) => v ?? '—' },
              { title: '积分', dataIndex: 'points', width: 90 },
            ]}
          />
        </Card>
      ))}
    </Space>
  );
}
