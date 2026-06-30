import { Empty, Table } from 'antd';
import type { RecordRow } from '@swim/shared';
import { STROKE_LABELS, formatSwimTime } from '../../lib/swim-time';

const GENDER_LABEL: Record<string, string> = { MALE: '男', FEMALE: '女' };

/** Club records board. Shared by owner console + public season page. */
export function RecordsTable({ rows }: { rows: RecordRow[] }) {
  if (!rows.length) return <Empty description="暂无纪录" />;
  return (
    <Table<RecordRow>
      rowKey={(r) => `${r.distanceMeters}-${r.stroke}-${r.gender}-${r.ageGroup}`}
      size="small"
      pagination={false}
      dataSource={rows}
      columns={[
        { title: '项目', render: (_: unknown, r: RecordRow) => `${r.distanceMeters}m ${STROKE_LABELS[r.stroke]}` },
        { title: '组别', render: (_: unknown, r: RecordRow) => `${GENDER_LABEL[r.gender]} · ${r.ageGroup}` },
        { title: '保持人', dataIndex: 'name', render: (v: string | null) => v ?? '—' },
        { title: '成绩', dataIndex: 'timeMs', render: (ms: number) => formatSwimTime(ms) },
        { title: '赛事', dataIndex: 'meetName' },
      ]}
    />
  );
}
