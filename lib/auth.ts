import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { anonymous } from "better-auth/plugins";
import { bearer } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { prisma } from "./db";

export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    session: {
        expiresIn: 30 * 24 * 60 * 60, // 30 days (Database session TTL)
        cookieCache: {
            enabled: true,
            maxAge: 2 * 60 * 60, // 2 hours (Cache TTL for database bypass)
        },
    },
    baseURL: process.env.BETTER_AUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
    secret: process.env.BETTER_AUTH_SECRET || 'development-secret-key-123',
    trustedOrigins: [
        "https://editorxx.com", 
        "myapp://",
        ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
        ...(process.env.VERCEL_PROJECT_PRODUCTION_URL ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`] : [])
    ], // Include AppInfo.website and Vercel preview URLs
    plugins: [
        anonymous(),
        bearer(),
        expo(),
    ],
});
