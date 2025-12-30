import { api } from "@/lib/api";

export async function signup(email: string, password: string) {
  const r = await api.post<{ accessToken: string }>("/auth/signup", { email, password });
  return r.data;
}

export async function login(email: string, password: string) {
  const r = await api.post<{ accessToken: string }>("/auth/login", { email, password });
  return r.data;
}
