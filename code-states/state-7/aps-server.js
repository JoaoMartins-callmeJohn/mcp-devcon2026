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

const REDIRECT_URI = "http://localhost:3001/auth/callback";

// User access token, null until the user completes the 3-legged login
let userAccessToken = null;

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

  // Tool 3: get_user_info
  server.registerTool(
    "get_user_info",
    {
      description:
        "Returns the Autodesk profile of the currently logged-in user. " +
        "The user must first authenticate by visiting http://localhost:3001/auth/login in their browser.",
    },
    async () => {
      if (!userAccessToken) {
        return {
          content: [
            {
              type: "text",
              text: "Not authenticated. Ask the user to open http://localhost:3001/auth/login in their browser to log in with Autodesk.",
            },
          ],
        };
      }

      const response = await fetch(
        "https://developer.api.autodesk.com/userinfo",
        {
          headers: { Authorization: `Bearer ${userAccessToken}` },
        },
      );

      if (!response.ok) {
        return {
          content: [{ type: "text", text: `Error: ${response.status}` }],
        };
      }

      const user = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `Name: ${user.name}\nEmail: ${user.email}\nAutodesk ID: ${user.sub}`,
          },
        ],
      };
    },
  );

  return server;
}

// Create HTTP server and start on port 3001
const httpServer = http.createServer(async (req, res) => {
  // Route 1: kick off 3-legged login
  if (req.url === "/auth/login") {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: APS_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: "data:read",
    });
    res.writeHead(302, {
      Location: `https://developer.api.autodesk.com/authentication/v2/authorize?${params}`,
    });
    res.end();
    return;
  }

  // Route 2: receive the OAuth callback, exchange the code for a user token
  if (req.url?.startsWith("/auth/callback")) {
    const url = new URL(req.url, "http://localhost:3001");
    const code = url.searchParams.get("code");

    if (!code) {
      res.writeHead(400).end("Missing authorization code.");
      return;
    }

    try {
      const tokenData = await authClient.getThreeLeggedToken(
        APS_CLIENT_ID,
        code,
        REDIRECT_URI,
        { clientSecret: APS_CLIENT_SECRET },
      );
      userAccessToken = tokenData.access_token;
      console.log("User authenticated via 3-legged OAuth.");

      res
        .writeHead(200, { "Content-Type": "text/html" })
        .end(
          "<h1>Login successful!</h1><p>Close this tab and return to VS Code.</p>",
        );
    } catch (err) {
      res.writeHead(500).end(`Token exchange failed: ${err.message}`);
    }
    return;
  }

  // Route 3: MCP endpoint
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
  console.log("Login at http://localhost:3001/auth/login");
});
