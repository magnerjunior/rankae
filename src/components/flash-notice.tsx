"use client";

import { useEffect, useState } from "react";

export function FlashNotice({ kind, message }: { kind: "success" | "error"; message: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), kind === "success" ? 1800 : 3800);
    return () => window.clearTimeout(timer);
  }, [kind]);
  if (!visible) return null;
  return <div className={`flash-toast ${kind}`} role={kind === "error" ? "alert" : "status"}>{message}</div>;
}
