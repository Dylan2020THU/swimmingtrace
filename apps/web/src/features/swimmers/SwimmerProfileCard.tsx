import { Avatar, Card, Descriptions, List, Skeleton, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { ageGroupOf, type MemberProfile } from '@swim/shared';

const GENDER_LABEL: Record<string, string> = { MALE: '男', FEMALE: '女' };

/** GitHub-profile-style basic-info sidebar for an owner's member. */
export function SwimmerProfileCard({ profile }: { profile?: MemberProfile }) {
  if (!profile) return <Card><Skeleton active avatar paragraph={{ rows: 6 }} /></Card>;
  const initial = (profile.name ?? profile.email).slice(0, 1).toUpperCase();
  const ageGroup = profile.birthDate ? ageGroupOf(new Date(profile.birthDate), new Date()) : null;
  return (
    <Card>
      <Space direction="vertical" align="center" style={{ width: '100%' }}>
        <Avatar size={96} style={{ backgroundColor: '#1677ff', fontSize: 36 }}>{initial}</Avatar>
        <Typography.Title level={4} style={{ margin: 0 }}>{profile.name ?? '—'}</Typography.Title>
        <Typography.Text type="secondary">{profile.email}</Typography.Text>
        <Space wrap>
          {profile.gender && <Tag>{GENDER_LABEL[profile.gender]}</Tag>}
          {ageGroup && <Tag color="blue">{ageGroup}</Tag>}
          <Tag color={profile.claimedAt ? 'green' : 'default'}>{profile.claimedAt ? '已认领' : '待认领'}</Tag>
        </Space>
      </Space>
      <Descriptions column={1} size="small" style={{ marginTop: 16 }}>
        <Descriptions.Item label="性别">{profile.gender ? GENDER_LABEL[profile.gender] : '—'}</Descriptions.Item>
        <Descriptions.Item label="年龄组">{ageGroup ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="出生日期">{profile.birthDate ? dayjs(profile.birthDate).format('YYYY-MM-DD') : '—'}</Descriptions.Item>
        <Descriptions.Item label="注册时间">{dayjs(profile.createdAt).format('YYYY-MM-DD')}</Descriptions.Item>
      </Descriptions>
      <Typography.Title level={5} style={{ marginTop: 8 }}>所属泳池</Typography.Title>
      <List
        size="small"
        dataSource={profile.pools}
        locale={{ emptyText: '无' }}
        renderItem={(p) => (
          <List.Item>
            <Space wrap>
              <span>{p.poolName}</span>
              <Tag color={p.status === 'ACTIVE' ? 'green' : 'default'}>{p.status === 'ACTIVE' ? '活跃' : '停用'}</Tag>
              <Typography.Text type="secondary">{dayjs(p.joinedAt).format('YYYY-MM-DD')} 加入</Typography.Text>
            </Space>
          </List.Item>
        )}
      />
    </Card>
  );
}
