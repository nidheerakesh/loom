import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import App from "./App.tsx";
import { AuthProvider } from "./auth.tsx";
import "./index.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* next-themes was already a dependency and already had a `.dark` stylesheet shipping in
        production, but nothing ever mounted the provider or added the class — so none of it
        could run. `attribute="class"` matches `darkMode: "selector"` in the Tailwind config.

        `disableTransitionOnChange` stops every coloured element animating at once when the
        theme flips, which looks like a fault rather than a transition. The default starting
        value is the OS setting; the choice is remembered from then on. */}
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
