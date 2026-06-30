import { useState } from 'react';
import { App, Button, Card, Empty, Form, Input, List, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { EntryItem, ResultStatus, StandingsGroup, Stroke } from '@swim/shared';
import {
  useMeet, useAddRaceEvent, usePools, useEntries, useAddEntry, useSetResult, useStandings, useSeedEvent, usePublishMeet,
} from '../../lib/queries';
import * as ep from '../../lib/api/endpoints';
import { STROKE_LABELS, RESULT_STATUS_LABELS, formatSwimTime, parseSwimTime } from '../../lib/swim-time';

const GENDER_LABEL: Record<string, string> = { MALE: '男', FEMALE: '女' };
const MEDAL_COLOR: Record<string, string> = { gold: 'gold', silver: 'default', bronze: 'orange' };
const MEDAL_LABEL: Record<string, string> = { gold: '金', silver: '银', bronze: '铜' };

function EntryRow({ entry, eventId }: { entry: EntryItem; eventId: string }) {
  const { message } = App.useApp();
  const setResult = useSetResult(eventId);
  const [time, setTime] = useState(entry.resultTimeMs != null ? formatSwimTime(entry.resultTimeMs) : '');
  const [status, setStatus] = useState<ResultStatus>(entry.resultStatus === 'ENTERED' ? 'OK' : entry.resultStatus);

  const save = async () => {
    let resultTimeMs: number | null = null;
    if (status === 'OK') {
      const ms = parseSwimTime(time);
      if (ms == null) { message.error('成绩格式应为 m:ss.SS'); return; }
      resultTimeMs = ms;
    }
    try { await setResult.mutateAsync({ enid: entry.id, b: { resultStatus: status, resultTimeMs } }); message.success('已保存'); }
    catch (e: any) { message.error(e?.response?.data?.message ?? '保存失败'); }
  };

  return (
    <List.Item actions={[<Button key="s" size="small" loading={setResult.isPending} onClick={save}>保存</Button>]}>
      <Space wrap>
        <span>{entry.name ?? entry.email}</span>
        <Tag>{entry.gender ? GENDER_LABEL[entry.gender] : '缺资料'}</Tag>
        <Select
          size="small" value={status} style={{ width: 96 }} onChange={setStatus}
          options={(['OK', 'DNS', 'DNF', 'DQ'] as const).map((s) => ({ value: s, label: RESULT_STATUS_LABELS[s] }))}
        />
        <Input size="small" style={{ width: 100 }} placeholder="m:ss.SS" value={time} onChange={(e) => setTime(e.target.value)} disabled={status !== 'OK'} />
      </Space>
    </List.Item>
  );
}

function StandingsView({ groups }: { groups: StandingsGroup[] }) {
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

function StartList({ entries }: { entries: EntryItem[] }) {
  const seeded = entries.filter((e) => e.heat != null);
  if (!seeded.length) return <Empty description="尚未排道，点击「排道」生成出发名单" />;
  const heats = [...new Set(seeded.map((e) => e.heat as number))].sort((a, b) => a - b);
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {heats.map((h) => (
        <Card key={h} size="small" title={`第 ${h} 组`}>
          <Table
            rowKey="id" size="small" pagination={false}
            dataSource={seeded.filter((e) => e.heat === h).sort((a, b) => (a.lane as number) - (b.lane as number))}
            columns={[
              { title: '道次', dataIndex: 'lane', width: 70 },
              { title: '姓名', dataIndex: 'name', render: (v: string | null, r: any) => v ?? r.email },
              { title: '种子成绩', dataIndex: 'seedTimeMs', render: (ms: number | null) => formatSwimTime(ms) },
            ]}
          />
        </Card>
      ))}
    </Space>
  );
}

export function MeetDetailPage() {
  const { meetId = '' } = useParams();
  const { message } = App.useApp();
  const meet = useMeet(meetId);
  const pools = usePools();
  const addEvent = useAddRaceEvent(meetId);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [eventOpen, setEventOpen] = useState(false);
  const [eventForm] = Form.useForm();

  const [regPool, setRegPool] = useState<string | undefined>();
  const [regSwimmer, setRegSwimmer] = useState<string | undefined>();
  const swimmers = useQuery({ queryKey: ['swimmers', regPool, 1], queryFn: () => ep.listSwimmers(regPool!, 1), enabled: !!regPool });
  const addEntry = useAddEntry(selectedEvent ?? '', meetId);
  const seed = useSeedEvent(selectedEvent ?? '');
  const entries = useEntries(selectedEvent);
  const standings = useStandings(selectedEvent);

  const runSeed = async () => {
    try { await seed.mutateAsync(); message.success('已排道'); }
    catch (e: any) { message.error(e?.response?.data?.message ?? '排道失败'); }
  };

  const publish = usePublishMeet(meetId);
  const onPublish = async (checked: boolean) => {
    try { await publish.mutateAsync(checked); message.success(checked ? '已公开' : '已取消公开'); }
    catch (e: any) { message.error(e?.response?.data?.message ?? '操作失败'); }
  };
  const publicUrl = `${window.location.origin}/p/meets/${meetId}`;

  const submitEvent = async (v: { distanceMeters: number; stroke: Stroke }) => {
    try { await addEvent.mutateAsync({ distanceMeters: Number(v.distanceMeters), stroke: v.stroke }); eventForm.resetFields(); setEventOpen(false); }
    catch (e: any) { message.error(e?.response?.data?.message ?? '添加失败'); }
  };

  const register = async () => {
    if (!regSwimmer) return;
    try { await addEntry.mutateAsync({ swimmerId: regSwimmer }); setRegSwimmer(undefined); message.success('已报名'); }
    catch (e: any) { message.error(e?.response?.data?.message ?? '报名失败'); }
  };

  const m = meet.data;
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card
        loading={meet.isLoading}
        title={m?.name ?? '赛事'}
        extra={
          m && (
            <Space>
              <span style={{ color: 'var(--text-secondary)' }}>公开</span>
              <Switch checked={m.published} loading={publish.isPending} onChange={onPublish} />
              {m.published && (
                <Button size="small" onClick={() => { navigator.clipboard?.writeText(publicUrl); message.success('已复制公开链接'); }}>
                  复制链接
                </Button>
              )}
            </Space>
          )
        }
      >
        {m && (
          <Typography.Text type="secondary">
            {new Date(m.meetDate).toLocaleDateString()}
            {m.hostPoolName ? ` · ${m.hostPoolName}` : ''}
          </Typography.Text>
        )}
      </Card>

      <Card title="比赛项目" extra={<Button type="primary" onClick={() => setEventOpen(true)}>加项目</Button>}>
        {m && m.events.length === 0 && <Empty description='还没有项目，点击"加项目"' />}
        <Space wrap>
          {(m?.events ?? []).map((ev) => (
            <Button key={ev.id} type={selectedEvent === ev.id ? 'primary' : 'default'} onClick={() => setSelectedEvent(ev.id)}>
              {ev.distanceMeters}m {STROKE_LABELS[ev.stroke]} · {ev.entryCount} 人
            </Button>
          ))}
        </Space>
      </Card>

      {selectedEvent && (
        <>
          <Card title="报名">
            <Space wrap>
              <Select
                placeholder="选泳池" style={{ width: 160 }} value={regPool}
                onChange={(v) => { setRegPool(v); setRegSwimmer(undefined); }}
                options={(pools.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
              />
              <Select
                placeholder="选会员" style={{ width: 240 }} value={regSwimmer} onChange={setRegSwimmer} disabled={!regPool}
                options={(swimmers.data?.items ?? []).map((s) => ({ value: s.swimmerId, label: `${s.name ?? s.email}${s.gender && s.birthDate ? '' : '（缺资料）'}` }))}
              />
              <Button type="primary" disabled={!regSwimmer} loading={addEntry.isPending} onClick={register}>报名</Button>
            </Space>
          </Card>

          <Card title="报名与成绩">
            <List
              loading={entries.isLoading}
              dataSource={entries.data ?? []}
              locale={{ emptyText: '还没有报名' }}
              renderItem={(en) => <EntryRow key={en.id} entry={en} eventId={selectedEvent} />}
            />
          </Card>

          <Card title="出发名单（分组泳道）" loading={entries.isLoading} extra={<Button onClick={runSeed} loading={seed.isPending}>排道</Button>}>
            <StartList entries={entries.data ?? []} />
          </Card>

          <Card title="排行榜（按 性别 / 年龄组）" loading={standings.isLoading}>
            <StandingsView groups={standings.data ?? []} />
          </Card>
        </>
      )}

      <Modal title="加项目" open={eventOpen} onOk={() => eventForm.submit()} onCancel={() => setEventOpen(false)} confirmLoading={addEvent.isPending} okText="添加">
        <Form form={eventForm} layout="vertical" onFinish={submitEvent}>
          <Form.Item name="distanceMeters" label="距离（米）" rules={[{ required: true, message: '请输入距离' }]}><Input type="number" /></Form.Item>
          <Form.Item name="stroke" label="泳姿" rules={[{ required: true, message: '请选择泳姿' }]}>
            <Select options={Object.entries(STROKE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
