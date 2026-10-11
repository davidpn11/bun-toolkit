import { createContext, type ReactNode, useContext } from "react";
import type { BtkContext } from "../context.ts";

const BtkReactContext = createContext<BtkContext | null>(null);

export function TuiProviders({ ctx, children }: { ctx: BtkContext; children: ReactNode }) {
  return <BtkReactContext.Provider value={ctx}>{children}</BtkReactContext.Provider>;
}

export function useBtk(): BtkContext {
  const ctx = useContext(BtkReactContext);
  if (!ctx) throw new Error("useBtk() must be used inside <TuiProviders>");
  return ctx;
}
