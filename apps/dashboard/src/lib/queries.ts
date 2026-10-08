import { queryOptions } from "@tanstack/react-query";
import type { AvailabilitySettings, ChannelRow, ProjectStats, TeamResponse, DeliveryRow, MeResponse, ProjectDetail, SubmissionRow, SubmissionStatus, SubmissionsPage } from "@snippo/shared";
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

export const calendarQuery = (projectId: string, from: string, to: string) =>
  queryOptions({
    queryKey: ["calendar", projectId, from, to],
    queryFn: () => api<SubmissionRow[]>(`/projects/${projectId}/calendar?from=${from}&to=${to}`),
    placeholderData: (previous) => previous,
    refetchInterval: 60_000,
  });

export const availabilityQuery = (projectId: string) =>
  queryOptions({ queryKey: ["availability", projectId], queryFn: () => api<AvailabilitySettings>(`/projects/${projectId}/availability`) });

export const statsQuery = (projectId: string, days: number) =>
  queryOptions({
    queryKey: ["stats", projectId, days],
    queryFn: () => api<ProjectStats>(`/projects/${projectId}/stats?days=${days}`),
    placeholderData: (previous) => previous,
    refetchInterval: 60_000,
  });

export const teamQuery = queryOptions({ queryKey: ["team"], queryFn: () => api<TeamResponse>("/team") });
