import React, { createContext, useContext, useMemo } from "react";

export interface ThemeColors {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  danger: string;
  neutral: string;
  dim: string;
  borderFocused: string;
  borderUnfocused: string;
}

export interface ThemeContextValue {
  isNoColor: boolean;
  colors: ThemeColors;
}

// Standard 16-color ANSI baseline
const standardAnsiTheme: ThemeColors = {
  primary: "cyan",
  secondary: "white",
  success: "green",
  warning: "yellow",
  danger: "red",
  neutral: "white",
  dim: "gray",
  borderFocused: "cyan",
  borderUnfocused: "gray",
};

// No-color fallback (disables color styles)
const noColorTheme: ThemeColors = {
  primary: "white",
  secondary: "white",
  success: "white",
  warning: "white",
  danger: "white",
  neutral: "white",
  dim: "white",
  borderFocused: "white",
  borderUnfocused: "white",
};

const ThemeContext = createContext<ThemeContextValue>({
  isNoColor: false,
  colors: standardAnsiTheme,
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isNoColor = Boolean(
    process.env.NO_COLOR || process.env.TERM === "dumb" || !process.stdout.isTTY
  );

  const value = useMemo(
    () => ({
      isNoColor,
      colors: isNoColor ? noColorTheme : standardAnsiTheme,
    }),
    [isNoColor]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => useContext(ThemeContext);
