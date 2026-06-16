import { loadEnv, defineConfig } from "@medusajs/framework/utils";

loadEnv(process.env.NODE_ENV || "development", process.cwd());

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    databaseDriverOptions: {
      ssl: false,
      sslmode: "disable",
    },
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },
  modules: [
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "medusa-payment-mpesa/providers/mpesa",
            id: "mpesa",
            options: {
              consumer_key: process.env.MPESA_CONSUMER_KEY,
              consumer_secret: process.env.MPESA_CONSUMER_SECRET,
              business_short_code: process.env.MPESA_BUSINESS_SHORT_CODE,
              pass_key: process.env.MPESA_PASS_KEY,
              environment: process.env.MPESA_ENVIRONMENT || "sandbox",
              callback_base_url:
                process.env.MPESA_CALLBACK_BASE_URL ||
                process.env.BACKEND_URL ||
                "http://localhost:9000",
              initiator_name: process.env.MPESA_INITIATOR_NAME,
              initiator_password: process.env.MPESA_INITIATOR_PASSWORD,
              webhook_secret: process.env.MPESA_WEBHOOK_SECRET,
            },
          },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/event-bus-redis",
      options: { redisUrl: process.env.REDIS_URL },
    },
    {
      resolve: "@medusajs/medusa/workflow-engine-redis",
      options: { redis: { redisUrl: process.env.REDIS_URL } },
    },
    {
      resolve: "@medusajs/medusa/locking",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/locking-redis",
            id: "locking-redis",
            is_default: true,
            options: { redisUrl: process.env.REDIS_URL },
          },
        ],
      },
    },
  ],
  admin: {
    vite: () => {
      return {
        server: {
          host: "0.0.0.0",
          allowedHosts: ["localhost", ".localhost", "127.0.0.1"],
          hmr: {
            port: 5173,
            clientPort: 5173,
            host: "localhost",
            protocol: "ws",
          },
        },
      };
    },
  },
});
