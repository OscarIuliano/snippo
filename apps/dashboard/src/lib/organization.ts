// The organization the dashboard works on, for users in more than one (e.g. an agency).
const KEY = "snippo:organization";

export function activeOrganization(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setActiveOrganization(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Storage blocked: the API falls back to the first organization.
  }
}
