"use client";

import { useEffect, useRef } from "react";
import { Icon } from "./Icon";

/** Accessible modal or side drawer built on the native <dialog> element (focus trap and Escape built in). */
export function Dialog({ open, onClose, title, sub, children, footer, variant = "modal", wide }: {
  open: boolean; onClose: () => void; title: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode;
  footer?: React.ReactNode; variant?: "modal" | "drawer"; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`${variant}${wide ? " wide" : ""}`}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      aria-labelledby="dlg-title"
    >
      {open ? (
        <>
          <div className="dlg-head">
            <div>
              <h2 className="dlg-title" id="dlg-title">{title}</h2>
              {sub ? <p className="dlg-sub">{sub}</p> : null}
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
          </div>
          <div className="dlg-body">{children}</div>
          {footer ? <div className="dlg-foot">{footer}</div> : null}
        </>
      ) : null}
    </dialog>
  );
}
