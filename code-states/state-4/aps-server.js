import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import http from "node:http";
import "dotenv/config";
import { AuthenticationClient, Scopes } from "@aps_sdk/authentication";
import { StaticAuthenticationProvider } from "@aps_sdk/autodesk-sdkmanager";
import { OssClient } from "@aps_sdk/oss";

const { APS_CLIENT_ID, APS_CLIENT_SECRET } = process.env;
if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) {
  throw new Error("Missing APS_CLIENT_ID or APS_CLIENT_SECRET in environment.");
}

// --- Auth: 2-legged token with auto-refresh ---
const authClient = new AuthenticationClient();
let cachedToken = null;
let tokenExpiresAt = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;
  const token = await authClient.getTwoLeggedToken(
    APS_CLIENT_ID,
    APS_CLIENT_SECRET,
    [Scopes.DataRead, Scopes.DataWrite, Scopes.BucketRead, Scopes.BucketCreate],
  );
  cachedToken = token.access_token;
  tokenExpiresAt = token.expires_at; // already in ms
  console.log("APS token refreshed.");
  return cachedToken;
}

// SDK client factory
async function getOssClient() {
  return new OssClient({
    authenticationProvider: new StaticAuthenticationProvider(await getToken()),
  });
}

// Factory: fresh McpServer per request
function createServer() {
  const server = new McpServer({ name: "devcon-aps-server", version: "1.0.0" });

  // Tool 1: list OSS buckets
  server.registerTool(
    "list_buckets",
    {
      description:
        "Lists all OSS storage buckets belonging to this APS application",
      inputSchema: {
        region: z
          .enum(["US", "EMEA", "AUS", "CAN", "DEU", "IND", "JPN", "GBR"])
          .describe("Data center region to list buckets from"),
      },
    },
    async ({ region }) => {
      const oss = await getOssClient();
      const data = await oss.getBuckets({ region });
      const items = data.items ?? [];
      if (items.length === 0)
        return {
          content: [
            { type: "text", text: "No buckets found. Create one first." },
          ],
        };
      const lines = items.map(
        (b) =>
          `${b.bucketKey} (${b.policyKey}, created: ${new Date(b.createdDate).toLocaleDateString()})`,
      );
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  // Tool 2: create bucket
  server.registerTool(
    "create_bucket",
    {
      description: "Creates a new OSS storage bucket",
      inputSchema: {
        bucket_key: z
          .string()
          .describe(
            "Unique key for the bucket. Lowercase letters, numbers, and dashes only.",
          ),
        policy: z
          .enum(["transient", "temporary", "persistent"])
          .describe(
            "Retention policy: transient (24h), temporary (30 days), persistent (indefinite)",
          ),
        region: z
          .enum(["US", "EMEA", "AUS", "CAN", "DEU", "IND", "JPN", "GBR"])
          .describe("Data center region for the bucket"),
      },
    },
    async ({ bucket_key, policy, region }) => {
      const oss = await getOssClient();
      try {
        await oss.createBucket(region, {
          bucketKey: bucket_key,
          policyKey: policy,
        });
        return {
          content: [
            {
              type: "text",
              text: `Bucket '${bucket_key}' created with policy '${policy}'.`,
            },
          ],
        };
      } catch (err) {
        const msg = err?.message ?? String(err);
        return { content: [{ type: "text", text: `Error: ${msg}` }] };
      }
    },
  );

  return server;
}

// Create HTTP server and start on port 3001
const httpServer = http.createServer(async (req, res) => {
  if (req.url !== "/mcp") {
    res.writeHead(404).end("Not found");
    return;
  }
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => transport.close());
  const server = createServer();
  await server.connect(transport);
  await transport.handleRequest(req, res);
});

httpServer.listen(3001, () => {
  console.log("APS MCP server running at http://localhost:3001/mcp");
});
