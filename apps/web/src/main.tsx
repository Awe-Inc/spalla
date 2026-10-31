import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { registerSW } from "virtual:pwa-register";

import "@/design/fonts.css";
import "@/design/tokens.css";

import { db } from "@/data/db";

import { offerAppUpdate } from "./app/appUpdate";
import { watchDatabaseOpen } from "./app/databaseHealth";
import { router } from "./app/router";

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh: () => offerAppUpdate(() => updateServiceWorker(true)),
});

void watchDatabaseOpen(() => db.open());

const root = document.getElementById("root");
if (!root) {
  throw new Error("Elemento #root não encontrado.");
}

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
