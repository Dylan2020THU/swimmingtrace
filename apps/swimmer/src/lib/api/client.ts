import axios from 'axios';
import { useAuthStore } from '../auth-store';

let redirectToLogin = () => {
  window.location.assign('/login');
};
export function setRedirectToLogin(fn: () => void) {
  redirectToLogin = fn;
}

export const api = axios.create({ baseURL: '/api' });
// 裸客户端：仅用于 refresh 调用本身，避免触发拦截器递归。
const bare = axios.create({ baseURL: '/api' });

let refreshPromise: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const rt = useAuthStore.getState().refreshToken;
  if (!rt) return null;
  try {
    const { data } = await bare.post('/auth/refresh', { refreshToken: rt });
    useAuthStore.getState().setTokens(data.accessToken, data.refreshToken);
    return data.accessToken as string;
  } catch {
    return null;
  }
}

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error?.response?.status;
    if (status === 401 && original && !original._retry && !String(original.url).includes('/auth/refresh')) {
      original._retry = true;
      // 单飞：并发 401 共享同一次刷新。
      if (!refreshPromise) refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
      const newToken = await refreshPromise;
      if (newToken) {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      useAuthStore.getState().clear();
      redirectToLogin();
    }
    return Promise.reject(error);
  },
);
