import { useState } from 'react';
import { Button, DatePicker, Form, Input, Selector, Toast } from 'antd-mobile';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useMyPools, useRecordSession } from '../../lib/queries';

export function RecordPage() {
  const pools = useMyPools();
  const record = useRecordSession();
  const navigate = useNavigate();
  const [dateVisible, setDateVisible] = useState(false);
  const [date, setDate] = useState(() => new Date());

  const onFinish = async (v: { poolId?: string[]; distanceMeters: string; durationSeconds?: string }) => {
    try {
      await record.mutateAsync({
        distanceMeters: Number(v.distanceMeters),
        durationSeconds: v.durationSeconds ? Number(v.durationSeconds) : undefined,
        swamAt: dayjs(date).toISOString(),
        poolId: v.poolId?.[0],
      });
      Toast.show({ icon: 'success', content: '已记录' });
      navigate('/');
    } catch (e: any) {
      Toast.show({ content: e?.response?.data?.message ?? '记录失败' });
    }
  };

  const options = (pools.data ?? []).map((p) => ({ label: p.name, value: p.id }));

  return (
    <div style={{ padding: 8 }}>
      <h2>记录游泳</h2>
      <Form
        onFinish={onFinish}
        footer={
          <Button block type="submit" color="primary" loading={record.isPending}>
            提交
          </Button>
        }
      >
        <Form.Item name="poolId" label="泳池" rules={[{ required: true, message: '请选择泳池' }]}>
          <Selector options={options} />
        </Form.Item>
        <Form.Item name="distanceMeters" label="距离(米)" rules={[{ required: true, message: '请输入距离' }]}>
          <Input type="number" placeholder="如 1000" />
        </Form.Item>
        <Form.Item name="durationSeconds" label="时长(秒)">
          <Input type="number" placeholder="可选" />
        </Form.Item>
        <Form.Item label="日期" onClick={() => setDateVisible(true)}>
          {dayjs(date).format('YYYY-MM-DD')}
        </Form.Item>
      </Form>
      <DatePicker
        visible={dateVisible}
        value={date}
        max={new Date()}
        onConfirm={setDate}
        onClose={() => setDateVisible(false)}
      />
    </div>
  );
}
