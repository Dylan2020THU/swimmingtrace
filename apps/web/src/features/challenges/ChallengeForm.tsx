import { DatePicker, Form, FormInstance, Input, InputNumber } from 'antd';
import type { Dayjs } from 'dayjs';
import type { CreateChallengeDto } from '@swim/shared';

export function ChallengeForm({ form, onFinish }: { form: FormInstance; onFinish: (dto: CreateChallengeDto) => void }) {
  const submit = (v: { name: string; goalDistanceMeters: number; range: [Dayjs, Dayjs] }) => {
    const [start, end] = v.range;
    onFinish({ name: v.name, goalDistanceMeters: v.goalDistanceMeters, startDate: start.toISOString(), endDate: end.toISOString() });
  };
  return (
    <Form form={form} layout="vertical" onFinish={submit}>
      <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
        <Input />
      </Form.Item>
      <Form.Item name="goalDistanceMeters" label="目标里程(米)" rules={[{ required: true, type: 'number', min: 1, message: '目标需 ≥ 1' }]}>
        <InputNumber style={{ width: '100%' }} min={1} />
      </Form.Item>
      <Form.Item name="range" label="起止日期" rules={[{ required: true, message: '请选择起止日期' }]}>
        <DatePicker.RangePicker style={{ width: '100%' }} />
      </Form.Item>
    </Form>
  );
}
