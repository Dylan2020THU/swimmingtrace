import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): JSX.Element { throw new Error('boom'); }

it('捕获子组件错误并显示兜底 UI', () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  render(<ErrorBoundary><Boom /></ErrorBoundary>);
  expect(screen.getByText(/出错了|页面错误/)).toBeInTheDocument();
  spy.mockRestore();
});
