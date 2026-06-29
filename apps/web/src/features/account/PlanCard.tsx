import { App, Button, Card, Descriptions, Space, Tag } from 'antd';
import { usePlan, useSetPlan } from '../../lib/queries';

export function PlanCard() {
  const { message } = App.useApp();
  const plan = usePlan();
  const setPlan = useSetPlan();
  const p = plan.data;

  const toggle = async () => {
    const next = p?.plan === 'PRO' ? 'FREE' : 'PRO';
    try {
      await setPlan.mutateAsync(next);
      message.success(next === 'PRO' ? '已升级到 Pro' : '已降级到 Free');
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? '操作失败');
    }
  };

  return (
    <Card title="计划" loading={plan.isLoading}>
      {p && (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Tag color={p.plan === 'PRO' ? 'gold' : 'default'}>{p.plan}</Tag>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="泳池">{p.usage.pools} / {p.limits.maxPools}</Descriptions.Item>
            <Descriptions.Item label="会员">{p.usage.members} / {p.limits.maxMembers}</Descriptions.Item>
            <Descriptions.Item label="数据导出">{p.features.export ? '可用' : '需 Pro'}</Descriptions.Item>
            <Descriptions.Item label="挑战赛">{p.features.challenges ? '可用' : '需 Pro'}</Descriptions.Item>
          </Descriptions>
          <Button
            type={p.plan === 'PRO' ? 'default' : 'primary'}
            loading={setPlan.isPending}
            onClick={toggle}
          >
            {p.plan === 'PRO' ? '降级到 Free' : '升级到 Pro'}
          </Button>
        </Space>
      )}
    </Card>
  );
}
