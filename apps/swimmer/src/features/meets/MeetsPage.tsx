import { useState } from 'react';
import { Button, Card, DatePicker, DotLoading, ErrorBlock, Input, List, Popup, Selector, Toast } from 'antd-mobile';
import dayjs from 'dayjs';
import type { Gender, MyMeetEvent } from '@swim/shared';
import { useMyMeets, useSelfRegister, useWithdrawEntry, useUpdateProfile } from '../../lib/queries';
import { STROKE_LABELS, formatSwimTime, parseSwimTime } from '../../lib/swim-time';

export function MeetsPage() {
  const meets = useMyMeets();
  const register = useSelfRegister();
  const withdraw = useWithdrawEntry();
  const updateProfile = useUpdateProfile();

  const [profileVisible, setProfileVisible] = useState(false);
  const [gender, setGender] = useState<Gender | undefined>();
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [birthVisible, setBirthVisible] = useState(false);

  const [registerEvent, setRegisterEvent] = useState<MyMeetEvent | null>(null);
  const [seedInput, setSeedInput] = useState('');

  const saveProfile = async () => {
    if (!gender || !birthDate) {
      Toast.show({ content: '请填写性别与出生日期' });
      return;
    }
    try {
      await updateProfile.mutateAsync({ gender, birthDate: dayjs(birthDate).toISOString() });
      Toast.show({ icon: 'success', content: '资料已保存' });
      setProfileVisible(false);
    } catch (e: any) {
      Toast.show({ content: e?.response?.data?.message ?? '保存失败' });
    }
  };

  const doRegister = async () => {
    if (!registerEvent) return;
    let seedTimeMs: number | undefined;
    if (seedInput.trim()) {
      const ms = parseSwimTime(seedInput);
      if (ms == null) {
        Toast.show({ content: '成绩格式应为 m:ss.SS' });
        return;
      }
      seedTimeMs = ms;
    }
    try {
      await register.mutateAsync({ eventId: registerEvent.id, b: { seedTimeMs } });
      Toast.show({ icon: 'success', content: '报名成功' });
      setRegisterEvent(null);
      setSeedInput('');
    } catch (e: any) {
      if (e?.response?.status === 422) {
        setRegisterEvent(null);
        setProfileVisible(true);
        Toast.show({ content: '请先完善性别与出生日期' });
      } else {
        Toast.show({ content: e?.response?.data?.message ?? '报名失败' });
      }
    }
  };

  const doWithdraw = async (entryId: string) => {
    try {
      await withdraw.mutateAsync(entryId);
      Toast.show({ icon: 'success', content: '已撤回' });
    } catch (e: any) {
      Toast.show({ content: e?.response?.data?.message ?? '撤回失败' });
    }
  };

  const data = meets.data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>赛事报名</h2>
        <Button size="small" onClick={() => setProfileVisible(true)}>完善资料</Button>
      </div>

      {meets.isError && <ErrorBlock status="default" title="加载失败" description="请稍后重试" />}
      {meets.isLoading && <div style={{ padding: 16, textAlign: 'center' }}><DotLoading /></div>}
      {!meets.isLoading && !meets.isError && data.length === 0 && (
        <ErrorBlock status="empty" title="暂无开放报名的赛事" description="你所属泳池的主办方目前没有开放报名的赛事。" />
      )}

      {data.map((m) => (
        <Card key={m.id} title={m.name}>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>
            {dayjs(m.meetDate).format('YYYY-MM-DD')}
            {m.hostPoolName ? ` · ${m.hostPoolName}` : ''}
          </div>
          <List>
            {m.events.map((ev) => (
              <List.Item
                key={ev.id}
                extra={
                  ev.myEntryId ? (
                    <Button size="small" color="danger" fill="outline" onClick={() => doWithdraw(ev.myEntryId!)}>
                      撤回
                    </Button>
                  ) : (
                    <Button size="small" color="primary" onClick={() => { setRegisterEvent(ev); setSeedInput(''); }}>
                      报名
                    </Button>
                  )
                }
              >
                {ev.distanceMeters}m {STROKE_LABELS[ev.stroke]}
                {ev.myEntryId && (
                  <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>
                    已报名{ev.mySeedTimeMs != null ? ` · ${formatSwimTime(ev.mySeedTimeMs)}` : ''}
                  </span>
                )}
              </List.Item>
            ))}
          </List>
        </Card>
      ))}

      <Popup visible={profileVisible} onMaskClick={() => setProfileVisible(false)} bodyStyle={{ padding: 16 }}>
        <h3>完善资料</h3>
        <div style={{ marginBottom: 6 }}>性别</div>
        <Selector
          options={[{ label: '男', value: 'MALE' }, { label: '女', value: 'FEMALE' }]}
          value={gender ? [gender] : []}
          onChange={(v) => setGender(v[0] as Gender)}
        />
        <div style={{ margin: '12px 0 6px' }}>出生日期</div>
        <Button onClick={() => setBirthVisible(true)}>
          {birthDate ? dayjs(birthDate).format('YYYY-MM-DD') : '选择日期'}
        </Button>
        <DatePicker
          visible={birthVisible}
          value={birthDate ?? undefined}
          max={new Date()}
          onConfirm={setBirthDate}
          onClose={() => setBirthVisible(false)}
        />
        <Button block color="primary" style={{ marginTop: 16 }} loading={updateProfile.isPending} onClick={saveProfile}>
          保存
        </Button>
      </Popup>

      <Popup visible={!!registerEvent} onMaskClick={() => setRegisterEvent(null)} bodyStyle={{ padding: 16 }}>
        <h3>报名 {registerEvent ? `${registerEvent.distanceMeters}m ${STROKE_LABELS[registerEvent.stroke]}` : ''}</h3>
        <div style={{ margin: '8px 0 6px' }}>种子成绩（可选，格式 m:ss.SS）</div>
        <Input placeholder="如 1:02.34" value={seedInput} onChange={setSeedInput} />
        <Button block color="primary" style={{ marginTop: 16 }} loading={register.isPending} onClick={doRegister}>
          确认报名
        </Button>
      </Popup>
    </div>
  );
}
