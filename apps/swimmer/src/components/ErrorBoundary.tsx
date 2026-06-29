import { Component, ReactNode } from 'react';
import { Button, ErrorBlock } from 'antd-mobile';

/** Catches render-time errors so a crash shows a friendly fallback, not a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    /* 可接入上报 */
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <ErrorBlock status="default" title="出错了" description="页面发生异常，请刷新重试。" />
          <Button block color="primary" style={{ marginTop: 16 }} onClick={() => window.location.reload()}>
            刷新
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
