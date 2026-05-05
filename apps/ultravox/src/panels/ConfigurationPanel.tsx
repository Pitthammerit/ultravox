import type { AppSettings } from "../lib/store-bridge";
import { applyTheme, type ThemeChoice } from "@ultravox/design-system";
import { HotkeyChip, Row, Section, Segmented } from "../components/ui";

interface ConfigurationPanelProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
}

export default function ConfigurationPanel({ settings, onChange }: ConfigurationPanelProps) {
  const appearance: "light" | "dark" | "auto" =
    settings.theme === "auto"
      ? "auto"
      : settings.theme === "light"
      ? "light"
      : "dark";
  const darkVariant: "ocean" | "night" =
    settings.theme === "dark-night" ? "night" : "ocean";

  const setAppearance = async (next: "light" | "dark" | "auto") => {
    let theme: ThemeChoice;
    if (next === "light") theme = "light";
    else if (next === "auto") theme = "auto";
    else theme = darkVariant === "night" ? "dark-night" : "dark-ocean";
    await onChange({ theme });
    applyTheme(theme);
  };

  const setDarkVariant = async (next: "ocean" | "night") => {
    const theme: ThemeChoice = next === "night" ? "dark-night" : "dark-ocean";
    await onChange({ theme });
    applyTheme(theme);
  };

  return (
    <>
      <Section label="Appearance">
        <Row
          label="Theme"
          control={
            <Segmented<"light" | "dark" | "auto">
              options={[
                { id: "light", label: "Light" },
                { id: "dark", label: "Dark" },
                { id: "auto", label: "Auto" },
              ]}
              value={appearance}
              onChange={setAppearance}
            />
          }
        />
        {appearance !== "light" && (
          <Row
            label="Dark variant"
            control={
              <Segmented<"ocean" | "night">
                options={[
                  { id: "ocean", label: "Ocean" },
                  { id: "night", label: "Night" },
                ]}
                value={darkVariant}
                onChange={setDarkVariant}
              />
            }
          />
        )}
      </Section>

      <Section label="Shortcuts" help="Editing comes in v1.1.">
        <Row
          label="Record toggle"
          control={<HotkeyChip>{settings.hotkeyRecord}</HotkeyChip>}
        />
        <Row
          label="Mode switcher"
          control={<HotkeyChip>{settings.hotkeyModeOverlay}</HotkeyChip>}
        />
      </Section>
    </>
  );
}
