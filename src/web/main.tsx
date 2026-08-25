import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const status =
          "status" in (error as object) ? (error as { status?: number }).status : undefined;
        return status !== undefined && status < 500 ? false : failureCount < 2;
      },
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

const root = document.getElementById("root");
if (!root) throw new Error("Application root element is missing.");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/admin">
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
