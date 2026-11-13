"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const THEME_NAMES: Record<string, string> = {
  light: "chiaro",
  dark: "scuro",
  system: "come il dispositivo",
};

const ThemeSwitcher = () => {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  // useEffect only runs on the client, so now we can safely show the UI
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // stesso spazio del pulsante, così la barra non si sposta al caricamento
    return <div className="h-11 w-11" aria-hidden="true" />;
  }

  const ICON_SIZE = 16;
  const current = THEME_NAMES[theme ?? "system"] ?? THEME_NAMES.system;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          aria-label={`Tema: ${current}. Cambia tema`}
          title="Cambia tema"
        >
          {theme === "light" ? (
            <Sun
              key="light"
              size={ICON_SIZE}
              className={"text-muted-foreground"}
              aria-hidden="true"
            />
          ) : theme === "dark" ? (
            <Moon
              key="dark"
              size={ICON_SIZE}
              className={"text-muted-foreground"}
              aria-hidden="true"
            />
          ) : (
            <Laptop
              key="system"
              size={ICON_SIZE}
              className={"text-muted-foreground"}
              aria-hidden="true"
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-content" align="start">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(e) => setTheme(e)}
        >
          <DropdownMenuRadioItem className="flex gap-2 min-h-11" value="light">
            <Sun size={ICON_SIZE} className="text-muted-foreground" aria-hidden="true" />{" "}
            <span>Chiaro</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem className="flex gap-2 min-h-11" value="dark">
            <Moon size={ICON_SIZE} className="text-muted-foreground" aria-hidden="true" />{" "}
            <span>Scuro</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem className="flex gap-2 min-h-11" value="system">
            <Laptop size={ICON_SIZE} className="text-muted-foreground" aria-hidden="true" />{" "}
            <span>Come il dispositivo</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export { ThemeSwitcher };
