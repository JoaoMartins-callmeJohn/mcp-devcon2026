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

## Part 1 – Create a New APS Application

In [Chapter 3](./3-connecting-autodesk-aps.md) you created a **Server-to-Server** application. That app type is designed for machine-to-machine calls. It has no concept of a user login and **cannot perform 3-legged OAuth**. You need a second application of a different type.

### 1. Open your Developer Hub

Go to [manage.autodesk.com](https://manage.autodesk.com) → **Products and Services → Hubs** → your developer hub → **Applications**.

### 2. Create a new application

Click **Create application** and fill in the form:

| Field    | Value                       |
| -------- | --------------------------- |
| Name     | e.g. `devcon-workshop-user` |
| App type | **Traditional Web App**     |

Click **Create**.

> **Traditional Web App** is the app type that supports 3-legged (user) authentication. Server-to-Server apps are limited to 2-legged tokens only.

### 3. Add the callback URL

Inside your new application, go to **General Settings** and find **Callback URLs**. Add:

```
http://localhost:3001/auth/callback
```

Click **Save changes**.

### 4. Enable API access

Under **API Access**, select at minimum **Data Management**. Click **Save changes**.

### 5. Store the new credentials

Your new app has its own **Client ID** and **Client Secret**. Add them to `.env` alongside the Chapter 3 credentials:

```bash
APS_CLIENT_ID="your-server-to-server-client-id"
APS_CLIENT_SECRET="your-server-to-server-client-secret"

APS_USER_CLIENT_ID="your-web-app-client-id"
APS_USER_CLIENT_SECRET="your-web-app-client-secret"
```

The 2-legged tools from Chapter 3 continue to use `APS_CLIENT_ID`/`APS_CLIENT_SECRET`. The 3-legged flow in this chapter uses `APS_USER_CLIENT_ID`/`APS_USER_CLIENT_SECRET`.

## Part 2 – Add 3-Legged OAuth aps-server.js

Three additions to `aps-server.js`: a variable to hold the user token, a new `get_user_info` tool, and two HTTP routes for the OAuth flow.

### Section 1 – Capture the user access token

After the existing environment variable check at the top of the file, add:

```javascript
const { APS_USER_CLIENT_ID, APS_USER_CLIENT_SECRET } = process.env;
if (!APS_USER_CLIENT_ID || !APS_USER_CLIENT_SECRET) {
  throw new Error(
    "Missing APS_USER_CLIENT_ID or APS_USER_CLIENT_SECRET in environment.",
  );
}

const REDIRECT_URI = "http://localhost:3001/auth/callback";

// User access token - null until the user completes the 3-legged login
let userAccessToken = null;
```

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
      "https://api.userprofile.autodesk.com/userinfo",
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
```

### Section 3 – Add auth routes to the HTTP server

The updated server handles three routes:

- **`/auth/login`**: redirects the user's browser to Autodesk's OAuth authorisation page, passing the client ID, callback URL, and requested scopes.
- **`/auth/callback`**: receives the short-lived authorisation code from Autodesk after the user logs in, exchanges it for a user access token, and stores it in `userAccessToken`.
- **`/mcp`**: the existing MCP endpoint, unchanged.

Replace the existing `http.createServer(...)` block with this version that handles all three:

```javascript
const httpServer = http.createServer(async (req, res) => {
  // Route 1: kick off 3-legged login
  if (req.url === "/auth/login") {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: APS_USER_CLIENT_ID,
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

    const tokenRes = await fetch(
      "https://developer.api.autodesk.com/authentication/v2/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: APS_USER_CLIENT_ID,
          client_secret: APS_USER_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
        }),
      },
    );

    if (!tokenRes.ok) {
      res.writeHead(500).end(`Token exchange failed: ${tokenRes.status}`);
      return;
    }

    const tokenData = await tokenRes.json();
    userAccessToken = tokenData.access_token;
    console.log("User authenticated via 3-legged OAuth.");

    res
      .writeHead(200, { "Content-Type": "text/html" })
      .end(
        "<h1>Login successful!</h1><p>Close this tab and return to VS Code.</p>",
      );
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

## Part 3 – Log In and Test

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

> "Use `#get_user_info` to show my Autodesk profile."

Copilot calls `get_user_info` on `aps-server.js` directly, which fetches the Autodesk `/userinfo` endpoint with the stored user token.

Expected output:

```
Name: Your Name
Email: you@company.com
Autodesk ID: AAAAAAAABBBBBBBB0000000
```

## What Changes in Production

The global `userAccessToken` variable works fine for a single-user workshop. A production system needs:

- **Session-scoped tokens**: store the token keyed by a session ID rather than a global variable, so each user has their own token
- **Token refresh**: the access token expires after 1 hour; use the `refresh_token` returned alongside it to request a new one without forcing a re-login
- **HTTPS callback URL**: Autodesk requires HTTPS for production callback URLs (`https://yourdomain.com/auth/callback`)
