"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { storage } from "@/lib/storage";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function pickTenantId(data: any): string | null {
  return (
    data?.tenantId ??
    data?.tenant?.id ??
    data?.membership?.tenantId ??
    data?.result?.tenantId ??
    null
  );
}

export default function AcceptInvitePage() {
  const router = useRouter();
  const sp = useSearchParams();
  const token = sp.get("token") ?? "";

  const [state, setState] = React.useState<
    "idle" | "missing" | "accepting" | "success" | "error"
  >("idle");
  const [err, setErr] = React.useState<string>("");

  React.useEffect(() => {
    async function run() {
      if (!token) {
        setState("missing");
        return;
      }

      setState("accepting");
      try {
        const r = await api.post("/tenants/invites/accept", { token });

        const tenantId = pickTenantId(r.data);
        if (tenantId) storage.setTenantId(String(tenantId));

        toast.success("Invite accepted");
        setState("success");

        // go to app
        router.replace("/tickets");
        router.refresh();
      } catch (e: any) {
        const msg =
          e?.response?.data?.message ??
          e?.message ??
          "Failed to accept invite. The link may be expired or already used.";

        setErr(String(msg));
        setState("error");

        // If user isn't logged in, this endpoint will 401. You can optionally redirect.
        if (e?.response?.status === 401) {
          toast.error("Please login to accept the invite");
          const next = `/accept-invite?token=${encodeURIComponent(token)}`;
          router.replace(`/login?next=${encodeURIComponent(next)}`);
        } else {
          toast.error(String(msg));
        }
      }
    }

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-6">
        {state === "missing" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <XCircle className="h-5 w-5" />
              Missing invite token
            </div>
            <div className="text-sm text-muted-foreground">
              This link is incomplete. Please open the full invite link again.
            </div>
            <Button className="w-full" onClick={() => router.replace("/login")}>
              Go to login
            </Button>
          </div>
        ) : state === "accepting" || state === "idle" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Loader2 className="h-5 w-5 animate-spin" />
              Accepting invite…
            </div>
            <div className="text-sm text-muted-foreground">
              Please don’t close this tab.
            </div>
          </div>
        ) : state === "success" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <CheckCircle2 className="h-5 w-5" />
              Invite accepted
            </div>
            <div className="text-sm text-muted-foreground">
              Redirecting you to your workspace…
            </div>
            <Button className="w-full" onClick={() => router.replace("/tickets")}>
              Continue
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <XCircle className="h-5 w-5" />
              Could not accept invite
            </div>
            <div className="text-sm text-muted-foreground break-words">{err}</div>

            <div className="flex gap-2">
              <Button variant="secondary" className="w-full" onClick={() => location.reload()}>
                Try again
              </Button>
              <Button className="w-full" onClick={() => router.replace("/login")}>
                Login
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
