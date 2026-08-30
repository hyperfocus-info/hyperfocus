import { createRequire } from "node:module";
import { marketplaceEnv as env, type MarketplaceEnv } from "../env";

const require = createRequire(import.meta.url);
const { createClerkClient, verifyToken } = require("@clerk/backend") as {
  createClerkClient: (options: { secretKey: string }) => {
    users: {
      getUser: (userId: string) => Promise<{
        emailAddresses: Array<{ emailAddress: string; id: string }>;
        firstName: string | null;
        lastName: string | null;
        primaryEmailAddressId: string | null;
        username: string | null;
      }>;
    };
  };
  verifyToken: (token: string, options: { secretKey: string }) => Promise<{ sub?: string }>;
};

export type VerifiedClerkIdentity = {
  clerkUserId: string;
  displayName: string;
  email: string | null;
  username: string | null;
};

const readPrimaryEmail = (user: Awaited<ReturnType<ReturnType<typeof createClerkClient>["users"]["getUser"]>>) => {
  const primary = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId);
  return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
};

/**
 * Verifies a Clerk session token and fetches the user identity.
 *
 * @param token - Raw Clerk session JWT
 * @returns Verified identity with clerkUserId, displayName, email, username
 * @throws Error if Clerk is not configured or token is invalid
 */
export async function verifyClerkSessionToken(token: string, runtimeEnv: MarketplaceEnv = env) {
  if (!runtimeEnv.clerkSecretKey) {
    throw new Error("Clerk is not configured.");
  }

  const claims = await verifyToken(token, { secretKey: runtimeEnv.clerkSecretKey });
  const clerkUserId = String(claims.sub ?? "");
  if (!clerkUserId) {
    throw new Error("Verified Clerk token did not include a user identifier.");
  }

  const clerkClient = createClerkClient({ secretKey: runtimeEnv.clerkSecretKey });
  const user = await clerkClient.users.getUser(clerkUserId);
  const firstName = user.firstName?.trim() ?? "";
  const lastName = user.lastName?.trim() ?? "";
  const displayName =
    `${firstName} ${lastName}`.trim() ||
    user.username ||
    readPrimaryEmail(user) ||
    "PadPilot User";

  return {
    clerkUserId,
    displayName,
    email: readPrimaryEmail(user),
    username: user.username ?? null,
  };
}
