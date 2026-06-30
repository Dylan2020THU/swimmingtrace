import { useState } from 'react';
import { Button, Card, Empty, Result, Space, Table, Tag, Typography } from 'antd';
import { useParams } from 'react-router-dom';
import type { PublicStartListHeat, StandingsGroup } from '@swim/shared';
import { usePublicMeet, usePublicStartList, usePublicResults } from '../../lib/queries';
import { STROKE_LABELS, RESULT_STATUS_LABELS, formatSwimTime } from '../../lib/swim-time';

const GENDER_LABEL: Record<string, string> = { MALE: '男', FEMALE: '女' };
const MEDAL_COLOR: Record<string, string> = { gold: 'gold', silver: 'default', bronze: 'orange' };
const MEDAL_LABEL: Record<string, string> = { gold: '金', silver: '银', bronze: '铜' };

function PublicStartList({ heats }: { heats: PublicStartListHeat[] }) {
  if (!heats.length) return <Empty description="尚未排道" />;
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {heats.map((h) => (
        <Card key={h.heat} size="small" title={`第 ${h.heat} 组`}>
          <Table
            rowKey="lane" size="small" pagination={false} dataSource={h.entries}
            columns={[
              { title: '道次', dataIndex: 'lane', width: 70 },
              { title: '姓名', dataIndex: 'name', render: (v: string | null) => v ?? '—' },
              { title: '种子成绩', dataIndex: 'seedTimeMs', render: (ms: number | null) => formatSwimTime(ms) },
            ]}
          />
        </Card>
      ))}
    </Space>
  );
}

function PublicStandings({ groups }: { groups: StandingsGroup[] }) {
  if (!groups.length) return <Empty description="暂无成绩" />;
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {groups.map((g) => (
        <Card key={`${g.gender}-${g.ageGroup}`} size="small" title={`${GENDER_LABEL[g.gender]} · ${g.ageGroup}`}>
          <Table
            rowKey="swimmerId" size="small" pagination={false} dataSource={g.rows}
            columns={[
              { title: '名次', dataIndex: 'rank', render: (r: number | null, row: any) => (row.medal ? <Tag color={MEDAL_COLOR[row.medal]}>{MEDAL_LABEL[row.medal]} {r}</Tag> : r ?? '—') },
              { title: '姓名', dataIndex: 'name', render: (v: string | null) => v ?? '—' },
              { title: '成绩', dataIndex: 'resultTimeMs', render: (ms: number | null, row: any) => (row.resultStatus === 'OK' ? formatSwimTime(ms) : RESULT_STATUS_LABELS[row.resultStatus]) },
            ]}
          />
        </Card>
      ))}
    </Space>
  );
}

export function MeetPublicPage() {
  const { meetId = '' } = useParams();
  const meet = usePublicMeet(meetId);
  const [sel, setSel] = useState<string | null>(null);
  const startlist = usePublicStartList(sel);
  const results = usePublicResults(sel);

  if (meet.isError) return <Result status="404" title="赛事不存在或未公开" />;
  const m = meet.data;
  return (
    <div style={{ maxWidth: 900, margin: '24px auto', padding: '0 16px' }}>
      <Card loading={meet.isLoading} title={m?.name ?? '赛事'}>
        {m && (
          <Typography.Text type="secondary">
            {new Date(m.meetDate).toLocaleDateString()}
            {m.hostPoolName ? ` · ${m.hostPoolName}` : ''}
          </Typography.Text>
        )}
      </Card>
      <Card title="比赛项目" style={{ marginTop: 16 }}>
        {m && m.events.length === 0 && <Empty description="暂无项目" />}
        <Space wrap>
          {(m?.events ?? []).map((ev) => (
            <Button key={ev.id} type={sel === ev.id ? 'primary' : 'default'} onClick={() => setSel(ev.id)}>
              {ev.distanceMeters}m {STROKE_LABELS[ev.stroke]}
            </Button>
          ))}
        </Space>
      </Card>
      {sel && (
        <>
          <Card title="出发名单" style={{ marginTop: 16 }} loading={startlist.isLoading}>
            <PublicStartList heats={startlist.data ?? []} />
          </Card>
          <Card title="成绩 / 名次" style={{ marginTop: 16 }} loading={results.isLoading}>
            <PublicStandings groups={results.data ?? []} />
          </Card>
        </>
      )}
    </div>
  );
}
