import { Card } from 'antd';
import { useRecords } from '../../lib/queries';
import { RecordsTable } from './RecordsTable';

export function RecordsPage() {
  const records = useRecords();
  return (
    <Card title="赛会纪录（按 项目 / 性别 / 年龄组）" loading={records.isLoading}>
      <RecordsTable rows={records.data ?? []} />
    </Card>
  );
}
