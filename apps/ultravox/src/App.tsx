import { BRANDING } from "./branding";

export default function App() {
  return (
    <main className="min-h-screen bg-color-bg-light text-color-text flex flex-col items-center justify-center gap-3">
      <h1 className="typography-h2 text-color-primary">{BRANDING.appName}</h1>
      <p className="typography-body text-color-secondary">
        Voice dictation companion — coming soon
      </p>
    </main>
  );
}
