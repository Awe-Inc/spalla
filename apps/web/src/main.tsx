import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { registerSW } from "virtual:pwa-register";

import "@/design/fonts.css";
import "@/design/tokens.css";

import { router } from "./app/router";

registerSW({ immediate: true });

const root = document.getElementById("root");
if (!root) {
  throw new Error("Elemento #root não encontrado.");
}

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
