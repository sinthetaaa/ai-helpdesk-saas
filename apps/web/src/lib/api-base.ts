export function apiBaseUrl() {
  // Browser
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  }

  // Next server (inside Docker)
  return process.env.API_INTERNAL_URL || "http://api:3001";
}
