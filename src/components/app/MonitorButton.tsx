"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { monitorAction } from "@/app/app/workflow-actions";

export function MonitorButton({ id, label, on, disabled }: { id: string; label: string; on: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn btn-secondary btn-sm" aria-pressed={on} disabled={pending || disabled}
      onClick={() => start(async () => { await monitorAction(id, label, !on); router.refresh(); })}>
      {on ? "✓ Monitoring" : "Monitor this pattern"}
    </button>
  );
}
