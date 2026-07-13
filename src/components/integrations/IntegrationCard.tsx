"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar, RefreshCw, Unplug } from "lucide-react";
import type { Integration, IntegrationSyncRun } from "@/lib/types";

/**
 * Google Calendar connection card. Three honest states: not connected,
 * connected, reconnect needed. Reconnect is a normal state (Google Testing
 * mode expires refresh tokens weekly), never a dead end.
 */
export function IntegrationCard({
  integration,
  lastRun,
}: {
  integration: Integration | null;
  lastRun: IntegrationSyncRun | null;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const needsReconnect = integration?.status === "error";

  async function syncNow() {
    setSyncing(true);
    try {
      const res = await fetch("/api/integrations/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "google_calendar" }),
      });
      if (res.status === 429) {
        toast.message("Synced very recently. Give it a couple of minutes.");
      } else if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(
          body.reconnectRequired
            ? "Google needs you to reconnect this calendar."
            : "Sync failed. Koda will retry overnight."
        );
      } else {
        toast.success("Calendar synced");
      }
      router.refresh();
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/integrations/google/disconnect", { method: "POST" });
      if (!res.ok) {
        toast.error("Could not disconnect. Try again.");
        return;
      }
      toast.success("Disconnected. Everything Koda imported was deleted.");
      setConfirming(false);
      router.refresh();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div>
      <p className="font-system text-primary mb-3">Google Calendar</p>
      <div className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-9 items-center justify-center rounded-lg bg-muted">
              <Calendar className="size-4 text-muted-foreground" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {integration
                  ? needsReconnect
                    ? "Reconnect needed"
                    : "Connected"
                  : "Not connected"}
                {integration?.account_label && (
                  <span className="font-normal text-muted-foreground"> · {integration.account_label}</span>
                )}
              </p>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                Read-only access to your calendar. Koda uses it to prep you before
                coffee chats, recruiter calls, and interviews, and to suggest
                follow-ups after them. Koda never creates or changes events.
              </p>
              {integration?.last_synced_at && (
                <p className="mt-1 font-system text-muted-foreground">
                  Last synced {new Date(integration.last_synced_at).toLocaleString()}
                  {lastRun?.status === "failed" && " · last sync failed"}
                </p>
              )}
              {needsReconnect && (
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-500">
                  Google needs you to sign in again to keep syncing. Your data is
                  untouched — reconnect to resume.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!integration || needsReconnect ? (
            <a
              href="/api/integrations/google/connect"
              className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-[#075B59] transition-colors"
            >
              {needsReconnect ? "Reconnect Google Calendar" : "Connect Google Calendar"}
            </a>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={syncNow}
              disabled={syncing}
              className="rounded-lg"
            >
              <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} aria-hidden />
              <span>{syncing ? "Syncing..." : "Sync now"}</span>
            </Button>
          )}
          {integration && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(true)}
              disabled={disconnecting}
              className="text-muted-foreground hover:text-red-600"
            >
              <Unplug className="size-3.5" aria-hidden />
              <span>Disconnect</span>
            </Button>
          )}
        </div>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Google Calendar?</DialogTitle>
            <DialogDescription>
              Koda will delete every calendar event it imported and revoke its
              access. Moves you already received stay on your board, but they
              lose their live source links. You can reconnect anytime.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={disconnecting}>
              Keep connected
            </Button>
            <Button
              variant="outline"
              onClick={disconnect}
              disabled={disconnecting}
              className="text-red-600 border-red-600/40 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              {disconnecting ? "Disconnecting..." : "Disconnect and delete data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
