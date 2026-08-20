import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { anonymous, openAPI } from "better-auth/plugins";
import { bearer } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { prisma } from "./db";
import { importPKCS8, SignJWT } from "jose";

// Generate the client secret JWT required for 'Sign in with Apple'.
async function generateAppleClientSecret() {
    if (!process.env.APPLE_PRIVATE_KEY) return "";
    const key = await importPKCS8(process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'), "ES256");
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({})
        .setProtectedHeader({ alg: "ES256", kid: process.env.APPLE_KEY_ID })
        .setIssuer(process.env.APPLE_TEAM_ID!)
        .setSubject(process.env.APPLE_CLIENT_ID!)
        .setAudience("https://appleid.apple.com")
        .setIssuedAt(now)
        .setExpirationTime(now + 180 * 24 * 60 * 60)
        .sign(key);
}

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
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        },
        // apple: async () => ({
        //     clientId: process.env.APPLE_CLIENT_ID as string,
        //     clientSecret: await generateAppleClientSecret(),
        // }),
    },
    trustedOrigins: [
        "meshwark://",
        "https://ezayarooh.com",
        "https://appleid.apple.com",
        ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
        ...(process.env.VERCEL_PROJECT_PRODUCTION_URL ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`] : [])
    ], // Include AppInfo.website and Vercel preview URLs
    plugins: [
        anonymous(),
        bearer(),
        expo(),
    ],
});
