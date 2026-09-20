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
        anonymous({
            onLinkAccount: async ({ anonymousUser, newUser }) => {
                try {
                    // 1. Transfer Contributions
                    await prisma.contribution.updateMany({
                        where: { userId: anonymousUser.user.id },
                        data: { userId: newUser.user.id }
                    });

                    // 2. Transfer Favorite Places (No unique constraints, safe to bulk update)
                    await prisma.favoritePlace.updateMany({
                        where: { userId: anonymousUser.user.id },
                        data: { userId: newUser.user.id }
                    });

                    // 3. Transfer Favorite Routes
                    // Routes have a @@unique([userId, routeType, regionId, routeId]) constraint.
                    // If we bulk update and the new user already has the same route favorited, it will throw an error.
                    // Instead, we try to update them one-by-one. If it fails, we delete the redundant anonymous record.
                    const anonRoutes = await prisma.favoriteRoute.findMany({
                        where: { userId: anonymousUser.user.id },
                        select: { id: true, routeType: true, regionId: true, routeId: true }
                    });

                    if (anonRoutes.length > 0) {
                        // Fetch the new user's existing routes to check for collisions
                        const existingRoutes = await prisma.favoriteRoute.findMany({
                            where: { userId: newUser.user.id },
                            select: { routeType: true, regionId: true, routeId: true }
                        });

                        const existingSet = new Set(
                            existingRoutes.map(r => `${r.routeType}-${r.regionId}-${r.routeId}`)
                        );

                        const routesToUpdate: string[] = [];
                        const routesToDelete: string[] = [];

                        for (const route of anonRoutes) {
                            if (existingSet.has(`${route.routeType}-${route.regionId}-${route.routeId}`)) {
                                routesToDelete.push(route.id);
                            } else {
                                routesToUpdate.push(route.id);
                                // Add to set to prevent duplicate collisions from within the anonymous routes themselves
                                existingSet.add(`${route.routeType}-${route.regionId}-${route.routeId}`);
                            }
                        }

                        // 1. Bulk update all safe routes in one query
                        if (routesToUpdate.length > 0) {
                            await prisma.favoriteRoute.updateMany({
                                where: { id: { in: routesToUpdate } },
                                data: { userId: newUser.user.id }
                            });
                        }

                        // 2. Bulk delete all conflicting anonymous routes in one query
                        if (routesToDelete.length > 0) {
                            await prisma.favoriteRoute.deleteMany({
                                where: { id: { in: routesToDelete } }
                            });
                        }
                    }

                    console.log(`[AUTH] Successfully linked anonymous user ${anonymousUser.user.id} data to new user ${newUser.user.id}`);
                } catch (e) {
                    console.error("[AUTH] Error linking anonymous user data:", e);
                }
            }
        }),
        bearer(),
        expo(),
    ],
});
