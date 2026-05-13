"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { MotionConfig } from "framer-motion";

type Theme = "dark" | "light" | "system";

const ThemeContext = createContext<{
  theme: Theme;
  resolved: "dark" | "light";
  setTheme: (t: Theme) => void;
}>({
  theme: "dark",
  resolved: "dark",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): "dark" | "light" {
  return "dark";
}

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const systemTheme = getSystemTheme();
  const resolved = theme === "system" ? systemTheme : theme;

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);

  return (
    <ThemeContext.Provider value={value}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </ThemeContext.Provider>
  );
}
