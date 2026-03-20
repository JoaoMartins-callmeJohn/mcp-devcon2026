# Establishing MCP Communication

_Build an MCP Server in Node.js and connect it to VS Code Copilot_

## Part 1 - Project Setup

### Step 1 - Create your project folder

```bash
mkdir devcon-workshop
cd devcon-workshop
```

### Step 2 - Initialise the project

```bash
npm init -y
```

### Step 3 - Enable ES Modules

Open `package.json` and set `"type": "module"`:

```json
{
  "name": "devcon-workshop",
  "version": "1.0.0",
  "type": "module"
}
```

> **Why?** The MCP SDK uses ES module syntax (`import`/`export`). Without this flag Node.js will reject it.

> **Already have a `"type"` field?** If your `package.json` already contains `"type": "commonjs"` or any other value, replace that line with `"type": "module"`, don't add a second `"type"` entry.

### Step 4 - Install dependencies

```bash
npm install @modelcontextprotocol/sdk zod
```

| Package                     | Link                                                                                 | Purpose                                                  |
| --------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `@modelcontextprotocol/sdk` | [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) | Anthropic's official MCP SDK - handles the full protocol |
| `zod`                       | [zod](https://www.npmjs.com/package/zod)                                             | Schema validation for tool inputs                        |

Your project folder should now look like this:

```
devcon-workshop/
├── node_modules/
├── package.json
└── package-lock.json
```

## Part 2 - Build the MCP Server

We start by creating the server. The server is the core of an MCP system. It is responsible for exposing the tools that clients can call, receiving incoming requests, executing the right tool handler, and sending the response back. Everything flows through it.

Create a new file called `server.js` in your project folder.

```
devcon-workshop/
├── node_modules/
├── package.json
├── package-lock.json
└── server.js         ← new
```

### The Imports - What Each One Does

```javascript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import http from "node:http";
```

| Import                          | What it does                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `McpServer`                     | Creates and manages your MCP server instance. Handles capability negotiation and tool routing automatically.                                            |
| `StreamableHTTPServerTransport` | Wires the MCP server to HTTP. Manages sessions, handles POST requests from clients, and supports Server-Sent Events (SSE) for streaming responses back. |
| `z` (Zod)                       | Defines and validates the input schema for each tool. Ensures the client sends the right types before your tool function runs.                          |
| `http`                          | Node.js built-in HTTP module. Creates the server that listens for incoming requests and routes them to the MCP transport.                               |

### Section 1 - Create the MCP Server

```javascript
function createServer() {
  const server = new McpServer({
    name: "devcon-workshop-server",
    version: "1.0.0",
  });

  // ... register tools here ...

  return server;
}
```

- `McpServer` takes a `name` and `version` - these are advertised to any client that connects during the handshake.
- The server is wrapped in a factory function so that each incoming HTTP request gets its own fresh instance. The MCP SDK only allows one active transport per server instance, so without this the server would crash on the second request.

### Section 2 - Register Tools

We'll register two tools to demonstrate the pattern:

- **`add`**: takes two numbers (`a` and `b`) and returns their sum. A minimal example that shows the basic structure without any business logic in the way.
- **`greet`**: takes a `name` and a `language` (`english`, `french`, or `spanish`) and returns a personalised greeting in the chosen language. Demonstrates how to use `z.enum()` to constrain a string input to a fixed set of allowed values.

```javascript
// Tool 1: add two numbers
server.registerTool(
  "add",
  {
    description: "Adds two numbers together",
    inputSchema: {
      a: z.number().describe("First number"),
      b: z.number().describe("Second number"),
    },
  },
  async ({ a, b }) => ({
    content: [{ type: "text", text: `Result: ${a + b}` }],
  }),
);

// Tool 2: greet someone
server.registerTool(
  "greet",
  {
    description: "Returns a greeting in the chosen language",
    inputSchema: {
      name: z.string().describe("Name of the person to greet"),
      language: z.enum(["english", "french", "spanish"]).describe("Language"),
    },
  },
  async ({ name, language }) => {
    const greetings = {
      english: `Hello, ${name}! Welcome to the DevCon MCP Workshop.`,
      french: `Bonjour, ${name} ! Bienvenue au Workshop MCP DevCon.`,
      spanish: `¡Hola, ${name}! Bienvenido al Workshop MCP de DevCon.`,
    };
    return {
      content: [{ type: "text", text: greetings[language] }],
    };
  },
);
```

`server.registerTool()` takes three arguments:

1. **Name** - the identifier clients use to call this tool
2. **Config object** - contains `description` (used by LLMs to decide which tool to call) and `inputSchema` (Zod object defining and validating each input)
3. **Handler** - the async function that runs when the tool is called; must return a `content` array

### Section 3 - Create the HTTP Server and Start Listening

```javascript
const PORT = 3000;

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

httpServer.listen(PORT, () => {
  console.log(`MCP server running at http://localhost:${PORT}/mcp`);
});
```

- `sessionIdGenerator: undefined` - sets the server to stateless mode. Each request is self-contained.
- A fresh `StreamableHTTPServerTransport` is created per request.
- `res.on("close", () => transport.close())` ensures the transport is cleaned up when the HTTP connection closes.
- `transport.handleRequest(req, res)` does all MCP message parsing, routing, and response writing, no manual body parsing needed.

[View complete `server.js` in Source Code →](/code-states#state-1:server.js)

## Part 3 - Connect VS Code as Your MCP Host

VS Code with GitHub Copilot can act as an MCP host It connects to your running server, discovers its tools, and lets you call them through natural language. All you need to do is tell VS Code where to find the server.

Create a `.vscode` folder in your project and add `mcp.json`:

```
devcon-workshop/
├── .vscode/
│   └── mcp.json      ← new
├── node_modules/
├── package.json
├── package-lock.json
└── server.js
```

```json
{
  "servers": {
    "devcon-workshop": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

| Field             | What it does                                                                          |
| ----------------- | ------------------------------------------------------------------------------------- |
| `servers`         | A map of named MCP servers VS Code should know about                                  |
| `devcon-workshop` | The display name shown in VS Code's MCP server list                                   |
| `type: http`      | Tells VS Code to connect over HTTP                                                    |
| `url`             | The endpoint VS Code sends MCP requests to, must match where your server is listening |

## Part 4 - Run It

### Step 1 - Start the server

```bash
node server.js
```

Expected output:

```
MCP server running at http://localhost:3000/mcp
```

### Step 2 - Connect VS Code

Open the Command Palette (`Ctrl+Shift+P` on Windows/Linux, `Cmd+Shift+P` on Mac, or **View → Command Palette**) and run **MCP: List Servers**. You should see `devcon-workshop` listed with a **Start** button. Click it, VS Code will connect to your running server.

### Step 3 - Verify tool calls through Copilot Chat

Open Copilot Chat (`Ctrl+Alt+I` on Windows/Linux, `Cmd+Ctrl+I` on Mac, or click the **Copilot icon** in the Activity Bar) and switch to **Agent** mode by clicking the mode selector next to the model name. MCP tools are only available in Agent mode, the other modes don't support external tool calls.

To reference your MCP tools explicitly, use the `#` prefix:

> "Use `#add` to add 12 and 30"

> "Use `#greet` to greet Nabil in Spanish"

You will see a **tool call indicator** appear in the chat. Copilot shows which tool it invoked and the result before writing its final answer. That confirms your server is live and the MCP connection is working.

## Challenge

Add a third tool to `server.js` called `bim_element` that takes:

- `id` (string) - element ID, e.g. `"W-001"`
- `type` (string) - e.g. `"Wall"`, `"Door"`, `"Window"`
- `material` (string)
- `level` (string)

And returns a formatted summary:

```
[W-001] Wall | Material: Concrete | Level: L1
```

Then ask VS Code Copilot to describe a BIM element with ID `W-001`, type `Wall`, material `Concrete`, and level `L1`.

[View complete solution `server.js` (adds `bim_element`) →](/code-states#state-2:server.js)

## Quick Reference

| Command / Action                             | What it does                                       |
| -------------------------------------------- | -------------------------------------------------- |
| `node server.js`                             | Starts the MCP server on port 3000                 |
| VS Code MCP: List Servers → Start            | Connects VS Code Copilot to the **running** server |
| Copilot Chat → Agent mode                    | Calls tools via natural language                   |
| `server.registerTool(name, config, handler)` | Registers a new tool on the server                 |
