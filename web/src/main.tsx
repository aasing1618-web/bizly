import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

const racine = document.getElementById("racine");

if (racine === null) {
  throw new Error("Élément #racine introuvable dans index.html");
}

createRoot(racine).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
