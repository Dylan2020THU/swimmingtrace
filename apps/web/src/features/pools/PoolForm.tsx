import { Form, FormInstance, Input, InputNumber } from 'antd';
import type { CreatePoolDto } from '@swim/shared';

export function PoolForm({ form, onFinish, initialValues }: {
  form: FormInstance; onFinish: (v: CreatePoolDto) => void; initialValues?: Partial<CreatePoolDto>;
}) {
  return (
    <Form form={form} layout="vertical" onFinish={onFinish} initialValues={initialValues}>
      <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}><Input /></Form.Item>
      <Form.Item name="address" label="地址"><Input /></Form.Item>
      <Form.Item name="latitude" label="纬度"><InputNumber style={{ width: '100%' }} min={-90} max={90} /></Form.Item>
      <Form.Item name="longitude" label="经度"><InputNumber style={{ width: '100%' }} min={-180} max={180} /></Form.Item>
    </Form>
  );
}
