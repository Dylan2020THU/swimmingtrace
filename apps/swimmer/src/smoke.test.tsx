import { it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from './test/render';
import App from './App';

it('App 渲染标题', () => {
  renderWithProviders(<App />);
  expect(screen.getByText('Swim 游泳者')).toBeInTheDocument();
});
