export const storage = {
  getToken() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token");
  },
  setToken(token: string) {
    localStorage.setItem("token", token);
  },
  clearToken() {
    localStorage.removeItem("token");
  },

  getTenantId() {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem("tenantId");
    if (!v || v === "undefined" || v === "null") return null;
    return v;
  },
  setTenantId(id: string) {
    localStorage.setItem("tenantId", id);
  },
  clearTenantId() {
    localStorage.removeItem("tenantId");
  },

  getWorkspaceName() {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem("wb_name");
    if (!v || v === "undefined" || v === "null") return null;
    return v;
  },
  setWorkspaceName(name: string) {
    localStorage.setItem("wb_name", name);
  },
  clearWorkspaceName() {
    localStorage.removeItem("wb_name");
  },
};
