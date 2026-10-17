import { useId } from "react";

/** Small "i" tooltip, reachable by keyboard focus. */
export function Tip({ children, label = "More information" }: { children: React.ReactNode; label?: string }) {
  const id = useId();
  return (
    <span className="tip">
      <button type="button" className="tip-btn" aria-label={label} aria-describedby={id}>i</button>
      <span role="tooltip" id={id} className="tip-body">{children}</span>
    </span>
  );
}
