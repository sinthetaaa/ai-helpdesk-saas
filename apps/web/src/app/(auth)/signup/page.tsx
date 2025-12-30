"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { signup } from "@/lib/queries/auth";
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

type TenantMeItem = {
  tenant: { id: string; name: string; createdAt?: string };
  role: string;
};

function normalizeTenantId(v: string | null) {
  if (!v) return null;
  if (v === "undefined" || v === "null") return null;
  return v;
}

async function ensureTenantSelected() {
  const current = normalizeTenantId(storage.getTenantId());

  const r = await api.get<TenantMeItem[]>("/tenants/me");
  const memberships = r.data ?? [];

  let chosen =
    (current && memberships.find((m) => m.tenant?.id === current)?.tenant?.id) ||
    memberships[0]?.tenant?.id;

  let chosenName =
    (current && memberships.find((m) => m.tenant?.id === current)?.tenant?.name) ||
    memberships[0]?.tenant?.name;

  // If user has zero tenants, create one
  if (!chosen) {
    await api.post("/tenants", { name: "Demo Tenant" });
    const r2 = await api.get<TenantMeItem[]>("/tenants/me");
    const m2 = r2.data ?? [];
    chosen = m2[0]?.tenant?.id;
    chosenName = m2[0]?.tenant?.name;
  }

  if (!chosen) throw new Error("Could not select or create a tenant.");

  storage.setTenantId(chosen);

  // workspace name is optional (avoid TS/build breaks if not implemented)
  if (chosenName) (storage as any).setWorkspaceName?.(chosenName);

  return chosen;
}

export default function SignupPage() {
  const router = useRouter();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    try {
      const r = await signup(values.email, values.password);
      if (!r?.accessToken) throw new Error("No accessToken in /auth/signup response");

      storage.setToken(r.accessToken);

      // Pick/create tenant before navigating to tenant-guarded pages
      await ensureTenantSelected();

      toast.success("Account created");
      router.replace("/tickets");
    } catch (e: any) {
      console.error("[signup] failed:", e);
      toast.error(e?.response?.data?.message ?? e?.message ?? "Signup failed");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Create your account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div className="space-y-1">
              <Input placeholder="Email" {...form.register("email")} />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Input type="password" placeholder="Password" {...form.register("password")} />
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>

            <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Creating…" : "Create account"}
            </Button>
          </form>

          <div className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link className="text-foreground underline underline-offset-4" href="/login">
              Login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}