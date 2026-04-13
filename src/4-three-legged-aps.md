# User Authentication with APS (3-Legged)

_Accessing Autodesk Data as a Specific User_

[Chapter 3](./3-connecting-autodesk-aps.md) authenticated as your _application_. Every API call used an app-level token. Your server saw what the application was provisioned to see. **3-legged authentication** puts the user into the flow: the user logs in with their Autodesk account, and API calls are made on their behalf with their own permissions.

## 2-Legged vs 3-Legged

|                   | 2-Legged (Chapter 3)                   | 3-Legged (This Chapter)                  |
| ----------------- | -------------------------------------- | ---------------------------------------- |
| Who authenticates | Your application                       | A specific user                          |
| Credentials used  | Client ID + Secret                     | Client ID + Secret + User login          |
| Sees              | Everything your app is provisioned for | Everything that user is permitted to see |
| Token type        | Application token                      | User access token                        |
| Use case          | Server-to-server pipelines             | User-specific data, personalised tools   |

The 3-legged flow has four steps:

```
1. Your server redirects the user to Autodesk's login page
2. The user logs in at autodesk.com
3. Autodesk redirects back with a short-lived authorisation code
4. Your server exchanges the code for a user access token
```

Once the token is stored, any MCP tool can use it to call the Autodesk API as that user.

## Credentials

The **Traditional Web App** you created in the [Prerequisites](./prerequisites#aps-account-credentials-setup) supports both 2-legged and 3-legged OAuth, so no new application is needed. The callback URL (`http://localhost:3001/auth/callback`) was already configured during setup. We reuse the same `APS_CLIENT_ID` and `APS_CLIENT_SECRET` from your `.env` file for both flows.

## Add 3-Legged OAuth to aps-server.js

Two additions to `aps-server.js`: a variable to hold the user token, a new `get_user_info` tool, and two HTTP routes for the OAuth flow.

### Section 1 – Capture the user access token

After the existing environment variable check at the top of the file, add:

```javascript
const REDIRECT_URI = "http://localhost:3001/auth/callback";

// User access token - null until the user completes the 3-legged login
let userAccessToken = null;
```

> **⚠️ Workshop limitation:** `userAccessToken` is a global variable, one user's token is cached server-wide. This is fine for a single-user workshop, but in production you must scope tokens by session ID so each user has their own. See [Production Checklist](./production-checklist) for details.

### Section 2 – Tool: get_user_info

We add one new tool:

- **`get_user_info`**: returns the Autodesk profile (name, email, and Autodesk ID) of the currently logged-in user. If no user has completed the OAuth flow yet, it returns a message telling the user to open the login URL in their browser.

Inside `createServer()`, after the existing tools, register the user profile tool:

```javascript
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
```

> **Note:** The `/userinfo` endpoint follows the [OpenID Connect UserInfo](https://openid.net/specs/openid-connect-core-1_0.html#UserInfo) standard. See the [OIDC UserInfo reference](https://aps.autodesk.com/en/docs/profile/v2/reference/restapireference/oidcuserinfo/) for full details.

### Section 3 – Add auth routes to the HTTP server

The updated server handles three routes:

- **`/auth/login`**: redirects the user's browser to Autodesk's OAuth authorisation page, passing the client ID, callback URL, and requested scopes.
- **`/auth/callback`**: receives the short-lived authorisation code from Autodesk after the user logs in, exchanges it for a user access token using the SDK's `authClient.getThreeLeggedToken()`, and stores it in `userAccessToken`.
- **`/mcp`**: the existing MCP endpoint, unchanged.

Replace the existing `http.createServer(...)` and `httpServer.listen(...)` blocks with this version that handles all three:

```javascript
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
```

[View complete `aps-server.js` in Source Code →](/code-states#state-5:aps-server.js)

## Log In and Test

### Start the servers

```bash
# Terminal 1 - APS server (now also handles OAuth routes)
node aps-server.js

# Terminal 2 - workshop server
node server.js
```

### Log in with Autodesk

Open a browser and go to:

```
http://localhost:3001/auth/login
```

You are redirected to the Autodesk login page. Sign in with your Autodesk account. After a successful login, Autodesk calls your callback URL, your server exchanges the code for a user token, and the browser shows:

> _Login successful! Close this tab and return to VS Code._

Your terminal prints:

```
User authenticated via 3-legged OAuth.
```

### Ask VS Code Copilot

Run **MCP: List Servers → Restart** in the Command Palette. Then open Copilot Chat in **Agent** mode and ask:

```
Use `#get_user_info` to show my Autodesk profile.
```

Copilot calls `get_user_info` on `aps-server.js` directly, which fetches the Autodesk `/userinfo` endpoint with the stored user token.

Expected output:

```
Name: Your Name
Email: you@company.com
Autodesk ID: AAAAAAAABBBBBBBB0000000
```

## What Changes in Production

The warning above about global `userAccessToken` is the most critical item. A production system also needs:

- **Token refresh**: the access token expires after 1 hour; use the `refresh_token` returned alongside it to request a new one without forcing a re-login
- **HTTPS callback URL**: Autodesk requires HTTPS for production callback URLs (`https://yourdomain.com/auth/callback`)
