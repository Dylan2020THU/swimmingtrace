import { Component, ReactNode } from 'react';
import { Button, Result } from 'antd';

export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch() { /* 可接入上报 */ }
  render() {
    if (this.state.hasError) {
      return (
        <Result
          status="error"
          title="出错了"
          subTitle="页面发生异常，请刷新重试。"
          extra={<Button type="primary" onClick={() => window.location.reload()}>刷新</Button>}
        />
      );
    }
    return this.props.children;
  }
}
