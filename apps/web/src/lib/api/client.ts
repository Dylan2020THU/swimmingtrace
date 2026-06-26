import axios from 'axios';
import { useAuthStore } from '../auth-store';

let redirectToLogin = () => { window.location.assign('/login'); };
export function setRedirectToLogin(fn: () => void) { redirectToLogin = fn; }

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      useAuthStore.getState().clear();
      redirectToLogin();
    }
    return Promise.reject(error);
  },
);
