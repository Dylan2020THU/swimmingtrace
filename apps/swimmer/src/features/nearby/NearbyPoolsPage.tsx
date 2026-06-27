import { useEffect, useState } from 'react';
import { Button, DotLoading, ErrorBlock, Form, Input, List } from 'antd-mobile';
import { useNearbyPlaces } from '../../lib/queries';

function formatDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export function NearbyPoolsPage() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [manual, setManual] = useState(false);
  const nearby = useNearbyPlaces(coords);

  useEffect(() => {
    if (!navigator.geolocation) {
      setManual(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setManual(true),
    );
  }, []);

  const onManual = (v: { lat: string; lng: string }) => {
    const lat = parseFloat(v.lat);
    const lng = parseFloat(v.lng);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) setCoords({ lat, lng });
  };

  const data = nearby.data ?? [];

  return (
    <div style={{ padding: 8 }}>
      <h2>附近泳池</h2>
      {manual && (
        <Form
          onFinish={onManual}
          footer={<Button block type="submit" color="primary">搜索</Button>}
          style={{ marginBottom: 12 }}
        >
          <Form.Item name="lat" label="纬度" rules={[{ required: true, message: '请输入纬度' }]}>
            <Input placeholder="纬度" type="number" />
          </Form.Item>
          <Form.Item name="lng" label="经度" rules={[{ required: true, message: '请输入经度' }]}>
            <Input placeholder="经度" type="number" />
          </Form.Item>
        </Form>
      )}
      {!coords && !manual && (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <DotLoading /> 定位中…
        </div>
      )}
      {coords && nearby.isLoading && (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <DotLoading /> 搜索中…
        </div>
      )}
      {coords && nearby.isError && <ErrorBlock status="default" title="加载失败" description="请稍后重试" />}
      {coords && nearby.isSuccess && data.length === 0 && (
        <ErrorBlock status="empty" title="附近 5 公里内没有找到泳池" />
      )}
      {data.length > 0 && (
        <List>
          {data.map((p) => (
            <List.Item key={p.id} description={p.address ?? '—'} extra={formatDistance(p.distanceMeters)}>
              {p.name}
            </List.Item>
          ))}
        </List>
      )}
    </div>
  );
}
