import type { AppSettings } from "../lib/store-bridge";
import { applyTheme, type ThemeChoice } from "@ultravox/design-system";
import { Row, Section, Segmented } from "../components/ui";

interface ConfigurationPanelProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
}

export default function ConfigurationPanel({ settings, onChange }: ConfigurationPanelProps) {
  // Map our 4 themes to bka2brain's "appearance + dark variant" pattern.
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
      <Section label="Visual">
        <div className="rounded-xl border border-color-divider-on-dark/40 bg-color-surface px-4 py-3 flex flex-col gap-3">
          <Row
            label="Theme"
            control={
              <Segmented<"light" | "dark" | "auto">
                options={[
                  { id: "light", label: "☀ Light" },
                  { id: "dark", label: "☾ Dark" },
                  { id: "auto", label: "⌬ Auto" },
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
        </div>
      </Section>

      <Section label="Shortcuts">
        <Row
          label="Record toggle"
          help="Default record hotkey. Editing comes in v1.1."
          control={
            <span className="px-3 py-1 rounded-md bg-color-divider-on-dark/30 text-[12px] font-mono text-color-fg">
              {settings.hotkeyRecord}
            </span>
          }
        />
        <Row
          label="Mode switcher"
          control={
            <span className="px-3 py-1 rounded-md bg-color-divider-on-dark/30 text-[12px] font-mono text-color-fg">
              {settings.hotkeyModeOverlay}
            </span>
          }
        />
      </Section>
    </>
  );
}
