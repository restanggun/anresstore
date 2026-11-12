import type { NextConfig } from "next";
const config: NextConfig = { transpilePackages: ["@anres/ui", "@anres/supabase", "@anres/contracts"], poweredByHeader: false };
export default config;
