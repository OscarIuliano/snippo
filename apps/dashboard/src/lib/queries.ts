import { queryOptions } from "@tanstack/react-query";
import type { ChannelRow, DeliveryRow, MeResponse, ProjectDetail, SubmissionStatus, SubmissionsPage } from "@snippo/shared";
import { api } from "./api";
import { authClient } from "./auth";

export const sessionQuery = queryOptions({
  queryKey: ["session"],
  queryFn: async () => (await authClient.getSession()).data ?? null,
  staleTime: 60_000,
});

export const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => api<MeResponse>("/me") });

export const projectQuery = (id: string) =>
  queryOptions({ queryKey: ["project", id], queryFn: () => api<ProjectDetail>(`/projects/${id}`) });

export const submissionsQuery = (projectId: string, status?: SubmissionStatus) =>
  queryOptions({
    queryKey: ["submissions", projectId, status ?? "all"],
    queryFn: () => api<SubmissionsPage>(`/projects/${projectId}/submissions${status ? `?status=${status}` : ""}`),
    refetchInterval: 30_000,
  });

export const channelsQuery = (projectId: string) =>
  queryOptions({ queryKey: ["channels", projectId], queryFn: () => api<ChannelRow[]>(`/projects/${projectId}/channels`) });

export const deliveriesQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["deliveries", projectId],
    queryFn: () => api<DeliveryRow[]>(`/projects/${projectId}/deliveries`),
    // Poll while something is still being sent.
    refetchInterval: (query) => (query.state.data?.some((d) => d.status === "pending") ? 3_000 : 30_000),
  });
