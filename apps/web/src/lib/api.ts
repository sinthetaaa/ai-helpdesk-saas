import axios from "axios";
import { storage } from "./storage";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
});

api.interceptors.request.use((config) => {
  const token = storage.getToken();
  const tenantId = storage.getTenantId();

  config.headers = config.headers ?? {};

  const headers = config.headers as Record<string, any>;

  if (token) headers.Authorization = `Bearer ${token}`;
  else delete headers.Authorization;

  if (tenantId) headers["X-Tenant-Id"] = tenantId;
  else delete headers["X-Tenant-Id"];

  return config;
});
