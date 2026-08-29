import type { Database } from "bun:sqlite";
import type { ModuleListRow, ModuleRow, UserRow, VersionRow } from "./db";
import {
  getLatestAccessibleVersion,
  getLatestPublishedVersion,
  hasActiveModuleEntitlement,
} from "./db";
import { marketplaceEnv } from "./env";

/**
 * Checks whether the user can view the module (published or owner).
 *
 * @param user - Current user or null
 * @param moduleRow - Module row or null
 * @returns True if module is viewable
 */
export function canViewModule(user: UserRow | null, moduleRow: ModuleRow | null) {
  if (!moduleRow) {
    return false;
  }
  return moduleRow.visibility === "published" || moduleRow.owner_user_id === user?.id;
}

export function canDownloadModule(db: Database, user: UserRow | null, moduleRow: ModuleRow | null) {
  if (!moduleRow) {
    return false;
  }
  if (moduleRow.owner_user_id === user?.id) {
    return true;
  }
  if (moduleRow.visibility !== "published") {
    return false;
  }
  if (moduleRow.price_cents <= 0) {
    return true;
  }
  return Boolean(user && hasActiveModuleEntitlement(db, moduleRow.id, user.id));
}

export function effectiveModulePriceCents(
  moduleRow: Pick<ModuleRow, "price_cents">,
  user: UserRow | null,
  firstClassDiscountPercent = marketplaceEnv.firstClassDiscountPercent,
) {
  const firstClassActive =
    user?.subscription_status === "first_class_active" ||
    user?.subscription_status === "lifetime_and_first_class";
  const discount = firstClassActive
    ? Math.min(100, Math.max(0, firstClassDiscountPercent))
    : 0;
  return Math.max(0, Math.round(moduleRow.price_cents * (1 - discount / 100)));
}

/**
 * Maps UserRow to API user DTO.
 *
 * @param user - User row or null
 * @returns User DTO or null
 */
export function serializeUser(user: UserRow | null) {
  return user
    ? {
        clerkUserId: user.clerk_user_id,
        displayName: user.display_name,
        email: user.email,
        id: user.id,
        username: user.username,
      }
    : null;
}

/**
 * Maps ModuleListRow to API module list DTO.
 *
 * @param db - Database instance for version lookups
 * @param row - Module list row
 * @param user - Current user or null
 * @returns Module list DTO
 */
export function moduleListDto(
  db: Database,
  row: ModuleListRow,
  user: UserRow | null,
  firstClassDiscountPercent = marketplaceEnv.firstClassDiscountPercent,
) {
  const isOwner = row.owner_user_id === user?.id;
  const effectivePriceCents = effectiveModulePriceCents(row, user, firstClassDiscountPercent);
  const latestPublishedVersion = getLatestPublishedVersion(db, row.id);
  const canDownload = canDownloadModule(db, user, row) && Boolean(
    isOwner ? getLatestAccessibleVersion(db, row.id, user) : latestPublishedVersion,
  );
  return {
    canDownload,
    currency: row.currency,
    description: row.description,
    downloadUrl: canDownload ? `/api/modules/${row.id}/download` : null,
    id: row.id,
    latestVersion: latestPublishedVersion
      ? {
          fileSizeBytes: latestPublishedVersion.file_size_bytes,
          publishedAt: latestPublishedVersion.published_at,
          status: "published",
          version: latestPublishedVersion.version,
        }
      : null,
    name: row.name,
    owner: row.username ?? row.display_name ?? "unknown",
    priceCents: effectivePriceCents,
    slug: row.slug,
    visibility: row.visibility,
  };
}

/**
 * Maps ModuleRow to API module detail DTO.
 *
 * @param db - Database instance for version lookups
 * @param moduleRow - Module row
 * @param user - Current user or null
 * @returns Module detail DTO
 */
export function moduleDetailDto(
  db: Database,
  moduleRow: ModuleRow,
  user: UserRow | null,
  firstClassDiscountPercent = marketplaceEnv.firstClassDiscountPercent,
) {
  const isOwner = moduleRow.owner_user_id === user?.id;
  const latestPublishedVersion = getLatestPublishedVersion(db, moduleRow.id);
  const latestAccessibleVersion = canDownloadModule(db, user, moduleRow)
    ? isOwner
      ? getLatestAccessibleVersion(db, moduleRow.id, user)
      : latestPublishedVersion
    : null;

  return {
    actions: {
      canDownload: Boolean(latestAccessibleVersion),
      canPublish: isOwner,
      canUploadVersion: isOwner,
    },
    canDownload: Boolean(latestAccessibleVersion),
    currency: moduleRow.currency,
    description: moduleRow.description,
    downloadUrl: latestAccessibleVersion ? `/api/modules/${moduleRow.id}/download` : null,
    id: moduleRow.id,
    isOwner,
    latestAccessibleVersion: latestAccessibleVersion
      ? versionToDto(latestAccessibleVersion)
      : null,
    latestPublishedVersion: latestPublishedVersion ? versionToDto(latestPublishedVersion) : null,
    name: moduleRow.name,
    owner: moduleRow.username ?? moduleRow.display_name ?? "unknown",
    priceCents: effectiveModulePriceCents(moduleRow, user, firstClassDiscountPercent),
    slug: moduleRow.slug,
    visibility: moduleRow.visibility,
  };
}

function versionToDto(v: VersionRow) {
  return {
    fileSizeBytes: v.file_size_bytes,
    publishedAt: v.published_at,
    status: v.status,
    version: v.version,
  };
}
