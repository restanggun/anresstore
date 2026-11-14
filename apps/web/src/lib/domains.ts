export const domains = {
  web: process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000",
  auth: process.env.NEXT_PUBLIC_AUTH_URL || "http://localhost:3000",
  app: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
};

export function loginDestination() {
  const admin = process.env.NEXT_PUBLIC_ADMIN_URL;
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("app") === "admin" && admin ? admin : domains.app;
}
