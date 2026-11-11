import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Game } from "@/components/spacebound/Game";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Game />
  </StrictMode>,
);
