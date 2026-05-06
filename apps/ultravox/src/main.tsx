import "@ultravox/design-system/fonts.css";
import "@ultravox/design-system/tokens.css";
import "./styles/settings.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import PillWindow from "./windows/PillWindow";
import ModeOverlay from "./windows/ModeOverlay";

function pickRoot(): React.ReactElement {
  const route = window.location.hash.replace(/^#/, "") || "/";
  // Tag the body so settings.css can scope its background rule to the
  // settings window only — the pill + mode-overlay windows must stay
  // transparent or the rectangular WebView fills the rounded pill area
  // with the page color.
  document.body.dataset.route =
    route === "/pill" ? "pill" : route === "/mode-overlay" ? "mode-overlay" : "settings";
  if (route === "/pill") return <PillWindow />;
  if (route === "/mode-overlay") return <ModeOverlay />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{pickRoot()}</React.StrictMode>,
);
