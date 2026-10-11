import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

export type ScreenEntry = {
  id: string;
  title: string;
  render: () => ReactNode;
};

export type Navigation = {
  stack: readonly ScreenEntry[];
  current: ScreenEntry;
  canGoBack: boolean;
  push(screen: ScreenEntry): void;
  pop(): void;
  popTo(id: string): void;
  replace(screen: ScreenEntry): void;
  quit(): void;
  inputLocked: boolean;
  setInputLocked(locked: boolean): void;
};

const NavigationContext = createContext<Navigation | null>(null);
const ScreenActiveContext = createContext(true);

export const ScreenActiveProvider = ScreenActiveContext.Provider;

export function useScreenActive(): boolean {
  return useContext(ScreenActiveContext);
}

export function NavigationProvider({
  initial,
  onQuit,
  children,
}: {
  initial: ScreenEntry;
  onQuit: () => void;
  children: ReactNode;
}) {
  const [stack, setStack] = useState<ScreenEntry[]>([initial]);
  const [inputLocked, setInputLocked] = useState(false);

  const push = useCallback((screen: ScreenEntry) => setStack((s) => [...s, screen]), []);
  const pop = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const popTo = useCallback(
    (id: string) =>
      setStack((s) => {
        const index = s.findIndex((entry) => entry.id === id);
        return index === -1 ? s : s.slice(0, index + 1);
      }),
    [],
  );
  const replace = useCallback((screen: ScreenEntry) => setStack((s) => [...s.slice(0, -1), screen]), []);

  const value = useMemo<Navigation>(
    () => ({
      stack,
      current: stack[stack.length - 1] as ScreenEntry,
      canGoBack: stack.length > 1,
      push,
      pop,
      popTo,
      replace,
      quit: onQuit,
      inputLocked,
      setInputLocked,
    }),
    [stack, push, pop, popTo, replace, onQuit, inputLocked],
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): Navigation {
  const nav = useContext(NavigationContext);
  if (!nav) throw new Error("useNavigation() must be used inside <NavigationProvider>");
  return nav;
}
