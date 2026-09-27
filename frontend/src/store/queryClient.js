import { QueryClient } from '@tanstack/react-query';

// Server state lives in the React Query cache; React components keep only
// temporary UI state. Nothing business-related is written to localStorage.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      retry: (count, err) => err?.status >= 500 && count < 2,
      refetchOnWindowFocus: true,
    },
  },
});
