import { useEffect, useRef, useState } from 'react';
import { Card, Result, Button, Spin } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { verifyEmail } from '../../lib/api/endpoints';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'pending' | 'ok' | 'fail'>('pending');
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) {
      setState('fail');
      return;
    }
    verifyEmail(token)
      .then(() => setState('ok'))
      .catch(() => setState('fail'));
  }, [token]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <Card style={{ width: 420 }}>
        {state === 'pending' && <Spin tip="验证中…" />}
        {state === 'ok' && (
          <Result
            status="success"
            title="邮箱已验证"
            extra={
              <Button type="primary" onClick={() => navigate('/pools')}>
                进入控制台
              </Button>
            }
          />
        )}
        {state === 'fail' && (
          <Result status="error" title="链接无效或已过期" extra={<Button onClick={() => navigate('/login')}>返回登录</Button>} />
        )}
      </Card>
    </div>
  );
}
