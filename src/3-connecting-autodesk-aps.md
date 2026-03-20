# Connecting Autodesk APS (2-Legged)

_Giving Your MCP System Access to Real Design Data_

## Context: What Autodesk Has Built

Autodesk has been actively investing in MCP. Here is the landscape as of 2026:

| What                                      | Where                                                                                                                              | Status                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Official APS MCP server (Node.js)         | [github.com/autodesk-platform-services/aps-mcp-server-nodejs](https://github.com/autodesk-platform-services/aps-mcp-server-nodejs) | Public, experimental   |
| Official AEC Data Model MCP server (.NET) | [github.com/autodesk-platform-services/aps-aecdm-mcp-dotnet](https://github.com/autodesk-platform-services/aps-aecdm-mcp-dotnet)   | Public, experimental   |
| Autodesk-hosted MCP servers (enterprise)  | [autodesk.com/solutions/autodesk-ai/autodesk-mcp-servers](https://www.autodesk.com/solutions/autodesk-ai/autodesk-mcp-servers)     | Announced, coming soon |

The official Node.js server exposes tools for navigating **Autodesk Construction Cloud (ACC)**: listing projects, browsing issues, accessing documents. It uses **Secure Service Accounts (SSA)** and is designed as a **stdio subprocess** for tools like Claude Desktop and Cursor.

That architecture doesn't fit what we've been building. Our system is HTTP-first. More importantly, ACC data (projects, issues, folders) requires **3-legged authentication**. The user must log in, because ACC resources are user-scoped, not app-scoped. We cover that in [Chapter 4](./4-three-legged-aps.md).

**In this chapter** we focus on what **2-legged (app-to-service) tokens can do**: **OSS (Object Storage Service)**, the file storage layer of APS. With a 2-legged token you can create buckets, list them, and manage objects. No user login needed, and it works on the free tier.

We build `aps-server.js`, run it on port 3001, and connect VS Code Copilot directly to it, alongside your existing `server.js`. This demonstrates MCP's **one-to-many** architecture: a single client (VS Code Copilot) connects to multiple independent MCP servers and sees all their tools as one unified set.

```
VS Code Copilot → server.js     :3000 → Open-Meteo API
               → aps-server.js  :3001 → APS API (OSS)
```

## Part 1 - Set Up Credentials

### Store your credentials

Your project folder should look like this after creating the `.env` file:

```
devcon-workshop/
├── node_modules/
├── .env              ← new
├── server.js
├── package.json
└── package-lock.json
```

Add these to a `.env` file in your `devcon-workshop` folder:

```bash
APS_CLIENT_ID="your-client-id-here"
APS_CLIENT_SECRET="your-client-secret-here"
```

These were generated in [Prerequisites](./prerequisites#aps-account-credentials-setup) when you created your APS application credentials.

> **Never commit `.env` to git.** Add it to `.gitignore`.

Install [`dotenv`](https://www.npmjs.com/package/dotenv) to load them automatically:

```bash
npm install dotenv
```

Also install the **APS SDK** packages:

```bash
npm install @aps_sdk/autodesk-sdkmanager @aps_sdk/authentication @aps_sdk/oss
```

| Package                                                                                      | What it covers                                 |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| [`@aps_sdk/autodesk-sdkmanager`](https://www.npmjs.com/package/@aps_sdk/autodesk-sdkmanager) | Shared SDK manager and auth provider utilities |
| [`@aps_sdk/authentication`](https://www.npmjs.com/package/@aps_sdk/authentication)           | 2-legged and 3-legged OAuth tokens             |
| [`@aps_sdk/oss`](https://www.npmjs.com/package/@aps_sdk/oss)                                 | Object Storage Service (buckets and objects)   |

## Part 2 - Build the APS MCP Server

Create `aps-server.js`. This server handles authentication automatically - it fetches a 2-legged access token on startup and refreshes it when needed. It then exposes APS capabilities as MCP tools.

```
devcon-workshop/
├── node_modules/
├── .env
├── aps-server.js     ← new
├── package.json
├── package-lock.json
└── server.js
```

### The Imports - What Each One Does

```javascript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import http from "node:http";
import "dotenv/config";
import { AuthenticationClient, Scopes } from "@aps_sdk/authentication";
import { StaticAuthenticationProvider } from "@aps_sdk/autodesk-sdkmanager";
import { OssClient } from "@aps_sdk/oss";
```

| Import                          | What it does                                                               |
| ------------------------------- | -------------------------------------------------------------------------- |
| `McpServer`                     | Creates the APS MCP server instance                                        |
| `StreamableHTTPServerTransport` | Exposes it over HTTP - same pattern as every other server in this workshop |
| `z`                             | Validates tool inputs                                                      |
| `http`                          | Node.js built-in HTTP server on port 3001                                  |
| `dotenv/config`                 | Loads `APS_CLIENT_ID` and `APS_CLIENT_SECRET` from your `.env` file        |
| `AuthenticationClient, Scopes`  | SDK client for OAuth tokens; `Scopes` is the enum of permission scopes     |
| `StaticAuthenticationProvider`  | Wraps a token string so SDK clients can use it                             |
| `OssClient`                     | SDK client for Object Storage Service, no manual URLs needed               |

### Section 1 - Authentication: getting a 2-legged token

APS uses OAuth 2.0. For server-to-server access, you request a token using your client ID and secret. The token expires after 1 hour, so we cache it and refresh automatically:

```javascript
const { APS_CLIENT_ID, APS_CLIENT_SECRET } = process.env;

if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) {
  throw new Error("Missing APS_CLIENT_ID or APS_CLIENT_SECRET in environment.");
}

const authClient = new AuthenticationClient();
let cachedToken = null;
let tokenExpiresAt = 0;

async function getToken() {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const token = await authClient.getTwoLeggedToken(
    APS_CLIENT_ID,
    APS_CLIENT_SECRET,
    [Scopes.DataRead, Scopes.DataWrite, Scopes.BucketRead, Scopes.BucketCreate],
  );

  cachedToken = token.access_token;
  tokenExpiresAt = token.expires_at; // already in milliseconds, no * 1000 needed
  console.log("APS token refreshed.");
  return cachedToken;
}
```

Every tool handler calls `getToken()` before making an API request. If the token is still valid it is returned from cache; if it has expired a new one is fetched transparently.

To pass the token to SDK clients, wrap it in a `StaticAuthenticationProvider`:

```javascript
// Helper factory: creates a fresh OSS client with the current token
async function getOssClient() {
  return new OssClient({
    authenticationProvider: new StaticAuthenticationProvider(await getToken()),
  });
}
```

### Section 2 - Tool: list your OSS buckets

OSS (Object Storage Service) is where APS stores files before and after translation. This tool lists all buckets belonging to your application. Using `OssClient` from the SDK, there are no manual URLs or `Authorization` headers:

We'll register one tool here:

- **`list_buckets`**: takes a `region` and returns all OSS buckets belonging to your APS application in that region, showing each bucket's key, retention policy, and creation date.

```javascript
function createServer() {
  const server = new McpServer({ name: "devcon-aps-server", version: "1.0.0" });

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

      if (items.length === 0) {
        return {
          content: [
            { type: "text", text: "No buckets found. Create one first." },
          ],
        };
      }

      const lines = items.map(
        (b) =>
          `${b.bucketKey} (${b.policyKey}, created: ${new Date(b.createdDate).toLocaleDateString()})`,
      );
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  // see Section 3

  return server;
}
```

### Section 3 - Tool: create a bucket

With `list_buckets` in place (probably returning empty on a fresh account), the next piece is creating a bucket to store objects in.

We'll register one more tool:

- **`create_bucket`**: takes a `bucket_key`, a `policy` (`transient` / `temporary` / `persistent`), and a `region`, and creates a new OSS bucket under your APS application.

The `policyKey` controls retention:

| Policy       | Retention  |
| ------------ | ---------- |
| `transient`  | 24 hours   |
| `temporary`  | 30 days    |
| `persistent` | Indefinite |

```javascript
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
```

### Section 4 - Create the HTTP server and start on port 3001

Because each `McpServer` instance can only handle one active transport, we use the `createServer()` factory pattern, a fresh server (and transport) per HTTP request:

```javascript
const httpServer = http.createServer(async (req, res) => {
  if (req.url !== "/mcp") {
    res.writeHead(404).end("Not found");
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => transport.close());

  const server = createServer(); // fresh McpServer per request
  await server.connect(transport);
  await transport.handleRequest(req, res);
});

httpServer.listen(3001, () => {
  console.log("APS MCP server running at http://localhost:3001/mcp");
});
```

[View complete `aps-server.js` in Source Code →](/code-states#state-4:aps-server.js)

## Part 3 - Connect VS Code Copilot to the APS Server

Instead of routing APS calls through `server.js`, you connect VS Code Copilot **directly** to `aps-server.js` as a second MCP server. This is MCP's one-to-many model: one client, multiple servers, all tools available in one place.

Open `.vscode/mcp.json` and add the APS server alongside the existing workshop server:

```json
{
  "servers": {
    "devcon-workshop": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    },
    "devcon-aps": {
      "type": "http",
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

That's it. VS Code Copilot now connects to both servers on startup and merges their tools into a single unified set. No delegating tools, no proxy layer, each server owns its own tools.

[View complete `server.js` in Source Code →](/code-states#state-4:server.js)

## Part 4 - Run Everything

Start the servers:

```bash
# Terminal 1 - APS server (requires .env with your credentials)
node aps-server.js

# Terminal 2 - workshop server
node server.js
```

Run **MCP: List Servers → Start** in the Command Palette for both servers.

With both servers running, open Copilot Chat in **Agent** mode and ask:

> "What OSS buckets do I have in the US region of my APS account?"

> "Create a new OSS bucket called `devcon-workshop-test` with a persistent policy in the EMEA region."

> "List my buckets in the EMEA region again to confirm it was created."

On the last two prompts, watch Copilot call `create_bucket` then `list_buckets` automatically. You wrote zero orchestration code. Copilot figured out which server to call and how to combine the results.

## Further Reading

The **2-legged token** used here is limited to app-owned resources, OSS is one of them. ACC projects, issues, and user data are user-scoped and require a **3-legged token** where the actual user logs in. That is covered in [Chapter 4](./4-three-legged-aps.md).

Autodesk's official `aps-mcp-server-nodejs` uses **Secure Service Accounts (SSA)** for fine-grained per-user ACC access. It is built on stdio and designed for Claude Desktop, VS Code or Cursor rather than the HTTP-first system we built here. Explore it at [github.com/autodesk-platform-services/aps-mcp-server-nodejs](https://github.com/autodesk-platform-services/aps-mcp-server-nodejs) after the workshop.

## The Full Architecture

```
              You (natural language)
                       ↓
                VS Code Copilot
              ┌────────┴────────┐
              ↓                 ↓
        server.js :3000   aps-server.js :3001
              ↓                 ↓
         Open-Meteo        APS API (OSS)
          (HTTPS)        ├── list_buckets
                         └── create_bucket
```

VS Code Copilot connects to both servers directly. Each server is independent. Copilot sees one unified set of tools and decides how to combine them, that's the **one-to-many** model.
