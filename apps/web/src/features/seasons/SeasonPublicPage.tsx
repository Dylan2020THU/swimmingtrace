import { Card, Result } from 'antd';
import { useParams } from 'react-router-dom';
import { usePublicSeason, usePublicSeasonRecords } from '../../lib/queries';
import { SeasonStandings } from './SeasonStandings';
import { RecordsTable } from '../records/RecordsTable';

export function SeasonPublicPage() {
  const { seasonId = '' } = useParams();
  const season = usePublicSeason(seasonId);
  const records = usePublicSeasonRecords(seasonId);

  if (season.isError) return <Result status="404" title="赛季不存在或未公开" />;
  const s = season.data;
  return (
    <div style={{ maxWidth: 900, margin: '24px auto', padding: '0 16px' }}>
      <Card loading={season.isLoading} title={s?.name ?? '赛季'} />
      <Card title="赛季积分榜（按 性别 / 年龄组）" style={{ marginTop: 16 }} loading={season.isLoading}>
        <SeasonStandings groups={s?.standings ?? []} />
      </Card>
      <Card title="赛会纪录" style={{ marginTop: 16 }} loading={records.isLoading}>
        <RecordsTable rows={records.data ?? []} />
      </Card>
    </div>
  );
}
