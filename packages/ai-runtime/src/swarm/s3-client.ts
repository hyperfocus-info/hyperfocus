import { S3Client } from "bun";

/** The provider's credential metadata chooses the URL style; never guess from a failed upload. */
export function createSwarmS3Client(options: {
  bucket: string; endpoint: string; accessKeyId: string; secretAccessKey: string;
  region: string; urlStyle: "path" | "virtual-hosted";
}) {
  for (const value of [options.bucket, options.endpoint, options.accessKeyId, options.secretAccessKey, options.region]) {
    if (!value.trim() || value.includes("${{")) throw Error("S3 settings are missing or unresolved.");
  }
  const endpoint = new URL(options.endpoint);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
    throw Error("S3 endpoint must use HTTPS without embedded credentials or query parameters.");
  if (options.urlStyle !== "path" && options.urlStyle !== "virtual-hosted") throw Error("S3 URL style must be explicit.");
  if (options.urlStyle === "virtual-hosted") {
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(options.bucket) || endpoint.pathname !== "/")
      throw Error("Virtual-hosted S3 settings require a DNS bucket name and a base endpoint.");
    if (!endpoint.hostname.startsWith(`${options.bucket}.`)) endpoint.hostname = `${options.bucket}.${endpoint.hostname}`;
  }
  // With an explicit endpoint Bun does not prepend the bucket in virtual-hosted mode.
  return new S3Client({ bucket: options.bucket, endpoint: endpoint.toString(), accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey, region: options.region, virtualHostedStyle: options.urlStyle === "virtual-hosted" });
}
