import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): JSX.Element {
  throw new Error('boom');
}

it('子组件渲染抛错时显示兜底界面', () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  render(
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>,
  );
  expect(screen.getByText('出错了')).toBeInTheDocument();
  expect(screen.getByText('刷新')).toBeInTheDocument();
  spy.mockRestore();
});
