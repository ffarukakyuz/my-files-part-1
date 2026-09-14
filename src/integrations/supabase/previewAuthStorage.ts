// Simple localStorage-based auth storage for standalone project
export function brokeredPreviewStorage() {
  if (typeof window === 'undefined') return undefined;
  return localStorage;
}
