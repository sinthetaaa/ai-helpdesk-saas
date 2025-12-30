"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { storage } from "@/lib/storage";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = storage.getToken();
    if (!token) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [router, pathname]);

  return <>{children}</>;
}
