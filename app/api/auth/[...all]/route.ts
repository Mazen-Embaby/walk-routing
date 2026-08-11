import { auth } from "../../../../lib/auth"; // Adjusted path to lib/auth.ts
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth.handler);
