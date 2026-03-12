import path from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, ".env") });

const PORT = parseInt(process.env.PORT ?? "3000", 10);

export const config = {
  apiKey: process.env.HENRYLABS_API_KEY ?? "824c951e-dfac-4342-8e03",
  webhookSecret: process.env.HENRYLABS_WEBHOOK_SECRET ?? "whsec_virellio_2024",
  webhookBaseUrl: process.env.HENRYLABS_WEBHOOK_BASE_URL ?? `http://localhost:${PORT}`,
  port: PORT,
  supabase: {
    url: process.env.SUPABASE_PROJECT_URL ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  },
};
