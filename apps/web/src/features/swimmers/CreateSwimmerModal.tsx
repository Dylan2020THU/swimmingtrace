import { Form, Input, Modal, Select, App } from 'antd';
import { useCreateSwimmer } from '../../lib/queries';

export function CreateSwimmerModal({ poolId, open, onClose }: { poolId: string; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const createSwimmer = useCreateSwimmer(poolId);
  const { message } = App.useApp();

  const submit = async (v: { name?: string; email: string; gender?: 'MALE' | 'FEMALE'; birthDate?: string }) => {
    try { await createSwimmer.mutateAsync(v); form.resetFields(); onClose(); }
    catch (e: any) { message.error(e?.response?.data?.message ?? '创建失败'); }
  };

  return (
    <Modal title="新建会员" open={open} onOk={() => form.submit()} onCancel={onClose} confirmLoading={createSwimmer.isPending} okText="确定" okButtonProps={{ autoInsertSpace: false }}>
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}><Input /></Form.Item>
        <Form.Item name="name" label="姓名"><Input /></Form.Item>
        <Form.Item name="gender" label="性别（赛事分组用）">
          <Select allowClear placeholder="可选" options={[{ value: 'MALE', label: '男' }, { value: 'FEMALE', label: '女' }]} />
        </Form.Item>
        <Form.Item name="birthDate" label="出生日期（赛事分组用）"><Input type="date" /></Form.Item>
      </Form>
    </Modal>
  );
}
