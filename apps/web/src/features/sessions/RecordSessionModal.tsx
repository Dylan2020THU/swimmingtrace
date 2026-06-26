import { DatePicker, Form, InputNumber, Modal, App } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useRecordSession } from '../../lib/queries';

export function RecordSessionModal({ poolId, sid, open, onClose }: { poolId: string; sid: string; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const record = useRecordSession(poolId, sid);
  const { message } = App.useApp();

  const submit = async (v: { distanceMeters: number; durationSeconds?: number; swamAt?: Dayjs }) => {
    try {
      await record.mutateAsync({
        distanceMeters: v.distanceMeters,
        durationSeconds: v.durationSeconds,
        swamAt: (v.swamAt ?? dayjs()).toISOString(),
      });
      form.resetFields(); onClose();
    } catch (e: any) { message.error(e?.response?.data?.message ?? '代录失败'); }
  };

  return (
    <Modal
      title="代录游泳"
      open={open}
      onOk={() => form.submit()}
      onCancel={onClose}
      confirmLoading={record.isPending}
      okText="确定"
      okButtonProps={{ autoInsertSpace: false }}
    >
      <Form form={form} layout="vertical" onFinish={submit} initialValues={{ swamAt: dayjs() }}>
        <Form.Item name="distanceMeters" label="距离(米)" rules={[{ required: true, type: 'number', min: 1, message: '距离需 ≥ 1' }]}>
          <InputNumber style={{ width: '100%' }} min={1} />
        </Form.Item>
        <Form.Item name="durationSeconds" label="时长(秒)"><InputNumber style={{ width: '100%' }} min={1} /></Form.Item>
        <Form.Item name="swamAt" label="日期" rules={[{ required: true, message: '请选择日期' }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
      </Form>
    </Modal>
  );
}
