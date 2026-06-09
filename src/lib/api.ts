import axios from 'axios';

const rawApiUrl = import.meta.env.VITE_API_URL;
const apiBaseUrl = rawApiUrl
  ? `${rawApiUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')}/api`
  : '/api';
const tokenStorageKey = 'business_nexus_token';

export const getStoredToken = (): string | null => {
  return localStorage.getItem(tokenStorageKey);
};

export const setStoredToken = (token: string | null): void => {
  if (token) {
    localStorage.setItem(tokenStorageKey, token);
  } else {
    localStorage.removeItem(tokenStorageKey);
  }
};

export const api = axios.create({
  baseURL: apiBaseUrl,
});

export const getSocketServerUrl = (): string => {
  const configuredUrl = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || window.location.origin;

  if (configuredUrl.startsWith('/')) {
    return window.location.origin;
  }

  return configuredUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');
};

api.interceptors.request.use((config) => {
  const token = getStoredToken();

  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});