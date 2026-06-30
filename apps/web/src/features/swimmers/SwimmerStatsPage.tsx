import { useMemo, useState } from 'react';
import { Card, Col, Row, Select, Space, Statistic } from 'antd';
import { useParams } from 'react-router-dom';
import { useMemberProfile, useMemberSessions, useSwimmerStats } from '../../lib/queries';
import { HeatmapCard } from '../dashboard/HeatmapCard';
import { SwimmerProfileCard } from './SwimmerProfileCard';
import { MemberSessionList } from './MemberSessionList';

/** Owner-facing member profile page (GitHub-profile style): info sidebar + overview + heatmap + training detail. */
export function SwimmerStatsPage() {
  const { sid = '' } = useParams();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const profile = useMemberProfile(sid);
  const stats = useSwimmerStats(sid, year);
  const sessions = useMemberSessions(sid, year);

  const flat = useMemo(() => (sessions.data?.pages ?? []).flatMap((p) => p.items), [sessions.data?.pages]);
  const summary = stats.data?.summary;

  // Year options: from the member's registration year to the current year (descending).
  const startYear = profile.data ? new Date(profile.data.createdAt).getFullYear() : currentYear;
  const years: number[] = [];
  for (let y = currentYear; y >= Math.min(startYear, currentYear); y--) years.push(y);

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={8} lg={7}>
        <SwimmerProfileCard profile={profile.data} />
      </Col>
      <Col xs={24} md={16} lg={17}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Card title="会员训练概览" loading={stats.isLoading}>
            <Row gutter={16}>
              <Col span={8}><Statistic title="总里程(米)" value={summary?.totalDistanceMeters ?? 0} formatter={(v) => String(v)} /></Col>
              <Col span={8}><Statistic title="游泳次数" value={summary?.sessionCount ?? 0} formatter={(v) => String(v)} /></Col>
              <Col span={8}><Statistic title="总时长(秒)" value={summary?.totalDurationSeconds ?? 0} formatter={(v) => String(v)} /></Col>
            </Row>
          </Card>
          <HeatmapCard
            cells={stats.data?.heatmap ?? []}
            year={year}
            extra={
              <Select
                aria-label="选择年份"
                size="small"
                style={{ width: 100 }}
                value={year}
                onChange={setYear}
                options={years.map((y) => ({ value: y, label: `${y}年` }))}
              />
            }
          />
          <Card title="训练明细">
            <MemberSessionList
              sessions={flat}
              isLoading={sessions.isLoading}
              hasNextPage={!!sessions.hasNextPage}
              isFetchingNextPage={sessions.isFetchingNextPage}
              onLoadMore={() => sessions.fetchNextPage()}
            />
          </Card>
        </Space>
      </Col>
    </Row>
  );
}
