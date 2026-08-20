<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Multi Transit Backend (Next.js)

This is the backend API service for the Multi Transit application. It is primarily responsible for aggregating static GTFS and GTFS-RT (real-time) feeds across various global regions (Dubai, Oman, Malaysia, etc.) and exposing them uniformly to the Flutter mobile application.

## Environments & Database (Neon + Prisma)

This project uses **Neon Serverless Postgres** and **Prisma ORM**. Because Neon relies on connection poolers (`pgBouncer`), pushing schema changes (DDL) requires a **Direct** unpooled connection, while normal application queries require a **Pooled** connection. 

Your `.env` files must configure both:
```env
# Normal application queries (Pooled connection)
DATABASE_URL="postgresql://user:pass@ep-cool-snowflake-pooler.region.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Prisma Schema pushes (Direct unpooled connection)
DATABASE_URL_UNPOOLED="postgresql://user:pass@ep-cool-snowflake.region.aws.neon.tech/neondb?sslmode=require"
```

### Serverless WebSockets (`ws`) & Better Auth Integration
Vercel Serverless (Node.js runtime) does not support persistent TCP connections, which standard PostgreSQL relies on. To solve this, we use the Neon Serverless driver (`@neondatabase/serverless`) which tunnels database queries over WebSockets.
- **The `ws` Polyfill:** In `lib/db.ts`, we inject the `ws` package into `neonConfig.webSocketConstructor`. This provides the WebSocket implementation that the Vercel serverless environment needs to communicate with Neon.
- **Better Auth Integration:** Better Auth is completely database-agnostic. By passing our custom `PrismaClient` to `@better-auth/prisma-adapter` in `lib/auth.ts`, Better Auth automatically inherits these WebSocket tunneling capabilities. It works perfectly with Neon Serverless out-of-the-box, ensuring highly scalable authentication checks without exhausting TCP connection pools. *(Note: This setup requires standard Vercel Node.js Serverless Functions, as the Vercel Edge Runtime does not support the native `ws` module).*

### Two-Layered Token Validation (Performance Optimization)
To maximize Serverless performance and reduce Neon database compute costs, API token validation happens in two layers:
1. **The Shallow Edge Check (`proxy.ts`):** Our Edge middleware acts as a high-speed bouncer. It merely checks if the `Authorization: Bearer` header (or session cookie) exists. It does *not* cryptographically validate the token, ensuring unauthenticated bots are dropped instantly without waking up a Node.js serverless function.
2. **The Deep Cached Validation (`auth.api.getSession`):** Inside the actual API routes (e.g., `/api/contributions`), we call `getSession`. We have configured Better Auth with a 2-hour `cookieCache` (`maxAge: 2 * 60 * 60`). This means the first request hits the Neon Database to validate the token, but for the next 2 hours, Better Auth securely evaluates the cached session without ever querying the database again (`0ms` database latency).
   - **How it works on Serverless:** Because Vercel Serverless functions do not share memory, Better Auth achieves this by storing the encrypted `User` and `Session` data directly inside a signed HTTP cookie sent to the client. On subsequent requests, the new serverless instance unpacks and cryptographically verifies the cookie using the `BETTER_AUTH_SECRET`. This provides a fully stateless, zero-database cache without requiring Redis or persistent RAM!

### 1. Local Development (Testing)
To safely test locally without modifying production data, utilize Neon's **Branching** feature:
1. In the Neon Dashboard, create a new branch (e.g., `development`).
2. Copy the connection strings into a `.env.development` file in the `nextjs/` folder. Ensure you extract the direct URL by removing `-pooler` for the unpooled variable.
3. Push the schema to your development branch:
   ```bash
   npx dotenv-cli -e .env.development -- npx prisma db push
   ```
4. Run the local development server:
   ```bash
   npm run dev
   ```

### 2. Production
Production branches should be mapped directly inside the main `.env` file (or your Vercel Environment Variables).
1. Ensure the main `.env` contains the production Neon branch credentials.
2. Push the schema to production:
   ```bash
   npx prisma db push
   ```
   or 
   ```bash
   pnpm prisma db push

   ```
3. Build and start the production server locally (to test exactly what Vercel will deploy):
   ```bash
   npm run build
   npm start
   ```

*Note: As this application is deployed on Serverless Vercel, stateful requirements (like heavy rate-limiting) utilize Redis via [Upstash](https://upstash.com/).*

### 3. Fresh Force Migration (No Data Preservation)
If you ever completely restructure your database (e.g., enabling `multiSchema` or changing core relationships) and **do not** care about preserving existing data, you can forcefully drop and recreate all schemas.

**For Development (Development Branch):**
To completely wipe the database and re-apply all migrations from scratch, run:
```bash
npx prisma migrate reset --force && npx prisma migrate dev
```
*(If you use a `.env.development` file, prefix both commands with `npx dotenv-cli -e .env.development -- `)*

**For Production (Production Branch):**
**⚠️ WARNING: THIS WILL DESTROY ALL PRODUCTION DATA.**
If you are bootstrapping a completely fresh production environment and need to force the schema to sync regardless of existing tables, run:
```bash
npx prisma db push --accept-data-loss
```
Alternatively, to execute the tracked migrations natively on production, you would run `npx prisma migrate deploy`.

## GTFS-RT Caching Architecture (The 30/32 Rule)

To prevent rate-limiting from external feed providers (like Swiftly) and to optimize client-side battery life, this backend enforces a strict **30/32 second caching rule** for all real-time feeds:

1. **Internal Data Cache (30s):** The backend uses `next: { revalidate: 30 }` when fetching GTFS-RT Protobuf feeds. This guarantees the server only requests new data from the provider once every 30 seconds, regardless of traffic spikes.
2. **Edge CDN Cache (32s):** API routes return `'Cache-Control': 'public, s-maxage=32, stale-while-revalidate=15'`. The CDN serves cached JSON directly to the Flutter app for 32 seconds. The 2-second offset ensures that when the CDN cache expires, the internal Next.js cache has *already* expired, resulting in a perfectly synchronized fresh fetch.

## Flutter Client Compatibility & Implementation

The Flutter application (`mobile/lib/`) natively understands the unified JSON structures returned by this backend across all regions.

Currently, the Flutter `GtfsRealtimeService` successfully parses the `speed` and `bearing` fields from vehicle position updates. 

**Pending Client-Side Feature (Extrapolation):** 
Because the backend updates vehicle positions exactly every 30 seconds to conserve battery and network overhead, the Flutter client is expected to implement **client-side extrapolation**. The client should use the parsed `speed` and `bearing` attributes to animate the vehicle smoothly along the route polyline during the 30-second interval between API refreshes.

## Crowdsourced Contributions & Gamification

The backend supports an offline-first reporting system, allowing users to submit corrections for missing or inaccurate transit data (e.g., missing stops, incorrect schedules, or new route shapes).

- **Authentication & Guest Sessions (`better-auth`):** The API natively integrates with `better-auth` utilizing the `anonymous()` plugin. 
  - The catch-all route `/api/auth/[...all]` manages secure sign-in, token issuance, and account linking.
  - The Flutter application strictly uses the official `flutter_better_auth` SDK (via `FlutterBetterAuth.dioClient`) to abstract away session tokens.
  - If a user wishes to remain anonymous, the client instantly fetches a guest session token and caches it using the SDK's built-in secure storage.
- **Serverless PostgreSQL (Neon + Prisma):** The database connection is handled using Prisma ORM configured with the `@neondatabase/serverless` WebSocket driver. `User`, `Session`, and `Contribution` schemas are securely migrated to the Neon Database, enabling seamless relational linking.
- **API Endpoint (`/api/contributions`):** Handles both `GET` (for fetching a user's synced history) and `POST` (for submitting new reports). 
  - **Required Headers:** Every request must include the `x-fcm-token` header (for device tracking) and automatically includes the `Authorization: Bearer <session.token>` header injected by the `FlutterBetterAuth` client.
  - **Payload Sync:** The POST endpoint automatically links the payload to the registered `userId` (or falls back to an anonymous marker), parses the JSON payload (matching exactly with Flutter's `toJson` omitting the `fcmToken`), and calculates point rewards based on the type of contribution (e.g., 50 points for recording a new GPS shape, 5 points for reporting a bad schedule).
- **Offline-First Resilience:** The API accepts sync payloads that use the `createdAt` timestamp and `fcmToken` to ensure deduplication if the mobile client attempts to retry failed syncs.