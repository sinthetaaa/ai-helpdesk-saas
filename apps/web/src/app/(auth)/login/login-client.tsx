"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { login } from "@/lib/queries/auth";
import { storage } from "@/lib/storage";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Minimum 8 characters"),
});

type FormValues = z.infer<typeof schema>;

function extractApiError(e: any, fallback: string) {
  const data = e?.response?.data;
  if (typeof data?.message === "string") return data.message;

  const fieldErrors = data?.message?.fieldErrors;
  if (fieldErrors && typeof fieldErrors === "object") {
    const flat = Object.values(fieldErrors).flat().filter(Boolean);
    if (flat.length) return flat.join(", ");
  }

  return e?.message ?? fallback;
}

type TenantMeItem = {
  tenant: { id: string; name: string; createdAt?: string };
  role: string;
};

function setWorkspaceName(name: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("wb_name", name);
}

async function ensureTenantSelected() {
  // reuse existing selection if it’s still valid
  const current = storage.getTenantId();
  const safeCurrent =
    current && current !== "undefined" && current !== "null" ? current : null;

  const r = await api.get<TenantMeItem[]>("/tenants/me");
  const memberships = r.data ?? [];

  const currentMembership = safeCurrent
    ? memberships.find((m) => m.tenant?.id === safeCurrent)
    : undefined;

  let chosenId = currentMembership?.tenant?.id ?? memberships[0]?.tenant?.id;
  let chosenName = currentMembership?.tenant?.name ?? memberships[0]?.tenant?.name;

  // If user has zero tenants, create one
  if (!chosenId) {
    await api.post("/tenants", { name: "Demo Tenant" });
    const r2 = await api.get<TenantMeItem[]>("/tenants/me");
    const m2 = r2.data ?? [];
    chosenId = m2[0]?.tenant?.id;
    chosenName = m2[0]?.tenant?.name;
  }

  if (!chosenId) {
    throw new Error("Could not select or create a tenant.");
  }

  storage.setTenantId(chosenId);
  if (chosenName) setWorkspaceName(chosenName);

  return chosenId;
}

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/tickets";

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    try {
      const r = await login(values.email, values.password);
      if (!r?.accessToken) throw new Error("No accessToken returned");

      storage.setToken(r.accessToken);

      // Auto-pick tenant BEFORE navigating to tenant-guarded pages
      await ensureTenantSelected();

      toast.success("Logged in");
      router.replace(next);
    } catch (e: any) {
      toast.error(extractApiError(e, "Login failed"));
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Welcome back</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div className="space-y-1">
              <Input placeholder="Email" autoComplete="email" {...form.register("email")} />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Input
                type="password"
                placeholder="Password"
                autoComplete="current-password"
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>

            <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Logging in…" : "Login"}
            </Button>
          </form>

          <div className="text-sm text-muted-foreground">
            New here?{" "}
            <Link className="text-foreground underline underline-offset-4" href="/signup">
              Create account
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
