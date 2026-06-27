import { it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../test/msw';
import { renderWithProviders } from '../../test/render';
import { NearbyPoolsPage } from './NearbyPoolsPage';

const place = { id: 'p1', name: '北京池', address: '海淀区', latitude: 39.98, longitude: 116.31, distanceMeters: 1200 };

function setGeolocation(impl: { getCurrentPosition: (ok: any, err?: any) => void }) {
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: impl });
}

it('定位成功 → 列出附近泳池与距离', async () => {
  setGeolocation({ getCurrentPosition: (ok) => ok({ coords: { latitude: 39.99, longitude: 116.32 } }) });
  server.use(http.get('/api/places/nearby', () => HttpResponse.json([place])));
  renderWithProviders(<Routes><Route path="/nearby" element={<NearbyPoolsPage />} /></Routes>, { route: '/nearby' });
  expect(await screen.findByText('北京池')).toBeInTheDocument();
  expect(screen.getByText('1.2 km')).toBeInTheDocument();
});

it('定位失败 → 手填经纬度搜索', async () => {
  setGeolocation({ getCurrentPosition: (_ok, err) => err && err({ code: 1 }) });
  server.use(http.get('/api/places/nearby', () => HttpResponse.json([place])));
  renderWithProviders(<Routes><Route path="/nearby" element={<NearbyPoolsPage />} /></Routes>, { route: '/nearby' });
  await userEvent.type(await screen.findByPlaceholderText('纬度'), '39.99');
  await userEvent.type(screen.getByPlaceholderText('经度'), '116.32');
  await userEvent.click(screen.getByRole('button', { name: '搜索' }));
  expect(await screen.findByText('北京池')).toBeInTheDocument();
});
