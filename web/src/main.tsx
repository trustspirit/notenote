import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import koKR from "@astryxdesign/core/locales/ko-KR.generated.js";
import { Theme } from "@astryxdesign/core/theme";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { defaultThemeSlug, themes } from "./astryx-themes";
import { DialogsProvider } from "./components/Dialogs";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <InternationalizationProvider locale="ko-KR" messages={{ "ko-KR": koKR }}>
      <Theme theme={themes[defaultThemeSlug]} mode="light">
        <DialogsProvider>
          <App />
        </DialogsProvider>
      </Theme>
    </InternationalizationProvider>
  </StrictMode>,
);
