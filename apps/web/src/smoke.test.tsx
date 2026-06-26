import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from './test/render';
import App from './App';

describe('smoke', () => {
  it('App 渲染标题', () => {
    renderWithProviders(<App />);
    expect(screen.getByText('Swim 管理控制台')).toBeInTheDocument();
  });
});
