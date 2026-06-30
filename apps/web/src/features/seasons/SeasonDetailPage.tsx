import { App, Button, Card, Space, Switch, Typography } from 'antd';
import { useParams } from 'react-router-dom';
import { usePublishSeason, useSeason } from '../../lib/queries';
import { SeasonStandings } from './SeasonStandings';

export function SeasonDetailPage() {
  const { seasonId = '' } = useParams();
  const { message } = App.useApp();
  const season = useSeason(seasonId);
  const publish = usePublishSeason(seasonId);
  const s = season.data;
  const publicUrl = `${window.location.origin}/p/seasons/${seasonId}`;

  const onPublish = async (checked: boolean) => {
    try {
      await publish.mutateAsync(checked);
      message.success(checked ? '已公开' : '已取消公开');
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? '操作失败');
    }
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card
        loading={season.isLoading}
        title={s?.name ?? '赛季'}
        extra={
          s && (
            <Space>
              <span style={{ color: 'var(--text-secondary)' }}>公开</span>
              <Switch checked={s.published} loading={publish.isPending} onChange={onPublish} />
              {s.published && (
                <Button size="small" onClick={() => { navigator.clipboard?.writeText(publicUrl); message.success('已复制公开链接'); }}>
                  复制链接
                </Button>
              )}
            </Space>
          )
        }
      >
        {s && (
          <Typography.Text type="secondary">
            年龄基准日 {new Date(s.referenceDate).toLocaleDateString()} · {s.meetCount} 场赛事
          </Typography.Text>
        )}
      </Card>
      <Card title="赛季积分榜（按 性别 / 年龄组）" loading={season.isLoading}>
        <SeasonStandings groups={s?.standings ?? []} />
      </Card>
    </Space>
  );
}
