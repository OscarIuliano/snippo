import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ApiError } from "./lib/api";
import { createAppRouter } from "./router";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 4xx will not fix itself on retry.
      retry: (failures, error) => !(error instanceof ApiError && error.status < 500) && failures < 2,
    },
  },
});
const router = createAppRouter(queryClient);

// Session expired while using the app: back to the login page.
queryClient.getQueryCache().subscribe((event) => {
  if (event.type === "updated" && event.query.state.error instanceof ApiError && event.query.state.error.status === 401) {
    queryClient.setQueryData(["session"], null);
    void router.navigate({ to: "/accedi" });
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
