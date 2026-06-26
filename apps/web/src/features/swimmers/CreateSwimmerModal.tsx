import { Form, Input, Modal, App } from 'antd';
import { useCreateSwimmer } from '../../lib/queries';

export function CreateSwimmerModal({ poolId, open, onClose }: { poolId: string; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const createSwimmer = useCreateSwimmer(poolId);
  const { message } = App.useApp();

  const submit = async (v: { name?: string; email: string }) => {
    try { await createSwimmer.mutateAsync(v); form.resetFields(); onClose(); }
    catch (e: any) { message.error(e?.response?.data?.message ?? '创建失败'); }
  };

  return (
    <Modal title="新建会员" open={open} onOk={() => form.submit()} onCancel={onClose} confirmLoading={createSwimmer.isPending} okText="确定" okButtonProps={{ autoInsertSpace: false }}>
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}><Input /></Form.Item>
        <Form.Item name="name" label="姓名"><Input /></Form.Item>
      </Form>
    </Modal>
  );
}
