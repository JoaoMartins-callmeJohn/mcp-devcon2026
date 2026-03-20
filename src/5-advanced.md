# Advanced: Custom Client and LLM Agent

_Building the Loop That Powers Every AI Product_

## Introduction

Throughout this workshop VS Code Copilot acted as your MCP host. It connected to your servers, discovered the tools, and called them in response to natural language. That loop is not magic. In this chapter you will build it yourself, in two stages:

1. **`client.js`**: a programmatic MCP client that connects to your servers and calls every tool you have built across the workshop, so you can see the full picture in one place.
2. **`agent.js`**: a Gemini-powered agent that drives the same clients with a natural language loop: receive a prompt, discover tools, call the right ones, synthesise an answer.

By the end you will have a complete working agent and a clear mental model of what every AI coding assistant, chat interface, and automation tool is doing under the hood.

## Prerequisites

Make sure you have completed Chapters 01–03. Your project folder should look like this:

```
devcon-workshop/
├── .vscode/
│   └── mcp.json
├── node_modules/
├── .env
├── aps-server.js
├── package.json
├── package-lock.json
└── server.js
```

## Part 1 - Build client.js

`client.js` is a standalone script that connects directly to your MCP servers and calls tools programmatically, without VS Code or Copilot. Just like VS Code Copilot connects to multiple servers via `mcp.json`, your client connects to both `server.js` and `aps-server.js` over HTTP. This is useful for scripting, testing, and as the base for building `agent.js`.

Create a new file called `client.js` in your project folder.

```
devcon-workshop/
├── .vscode/
│   └── mcp.json
├── node_modules/
├── .env
├── aps-server.js
├── client.js         ← new
├── package.json
├── package-lock.json
└── server.js
```

### The Imports - What Each One Does

```javascript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
```

| Import                          | What it does                                                                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `Client`                        | The MCP client class. Manages the connection to the server and exposes methods like `listTools()` and `callTool()`.                 |
| `StreamableHTTPClientTransport` | Connects the client to a remote MCP server over HTTP. Sends JSON-RPC messages via POST and can receive streaming responses via SSE. |

### Section 1 - Connect to the servers

```javascript
// Connect to the workshop server
const workshopClient = new Client({
  name: "devcon-workshop-client",
  version: "1.0.0",
});
await workshopClient.connect(
  new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp")),
);
console.log("Connected to workshop MCP server.");

// Connect to the APS server
const apsClient = new Client({
  name: "devcon-aps-client",
  version: "1.0.0",
});
await apsClient.connect(
  new StreamableHTTPClientTransport(new URL("http://localhost:3001/mcp")),
);
console.log("Connected to APS MCP server.");
```

`client.connect()` triggers the MCP handshake: the client and server exchange names, versions, and supported capabilities. After this call the connection is ready. We connect to both servers independently, just like VS Code Copilot does.

### Section 2 - Discover available tools

```javascript
const { tools: workshopTools } = await workshopClient.listTools();
const { tools: apsTools } = await apsClient.listTools();
const allTools = [...workshopTools, ...apsTools];

console.log("\nAvailable tools:");
allTools.forEach((tool) => {
  console.log(`  - ${tool.name}: ${tool.description}`);
});
```

`listTools()` asks each server to advertise everything it can do. We merge the results into a single list. This is exactly what VS Code Copilot does when it connects to multiple servers via `mcp.json`.

### Section 3 - Call every tool from the workshop

```javascript
// Chapter 01 - add
const addResult = await workshopClient.callTool({
  name: "add",
  arguments: { a: 12, b: 30 },
});
console.log("\nadd(12, 30):", addResult.content[0].text);

// Chapter 01 - greet
const greetResult = await workshopClient.callTool({
  name: "greet",
  arguments: { name: "Nabil", language: "spanish" },
});
console.log("greet():", greetResult.content[0].text);

// Chapter 02 - get_weather
const weatherResult = await workshopClient.callTool({
  name: "get_weather",
  arguments: { city: "Amsterdam" },
});
console.log("get_weather():", weatherResult.content[0].text);

// Chapter 03 - create_bucket then list_buckets (directly on APS server)
const createResult = await apsClient.callTool({
  name: "create_bucket",
  arguments: {
    bucket_key: "devcon-test-us",
    policy: "persistent",
    region: "US",
  },
});
console.log("\ncreate_bucket():\n", createResult.content[0].text);

const bucketsResult = await apsClient.callTool({
  name: "list_buckets",
  arguments: { region: "US" },
});
console.log("\nlist_buckets():\n", bucketsResult.content[0].text);

await workshopClient.close();
await apsClient.close();
```

### Run It

Start the servers, then run the client:

```bash
# Terminal 1
node aps-server.js

# Terminal 2
node server.js

# Terminal 3
node client.js
```

[View complete `client.js` in Source Code →](/code-states#state-6:client.js)

---

## Part 2 - Get a Free Gemini API Key

Gemini's free tier is available through Google AI Studio. No credit card required, just a Google account.

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Sign in with your Google account
3. Click **Get API key** → **Create API key**
4. Copy the key

Add it to your `.env` file:

```bash
GEMINI_API_KEY="your-key-here"
```

> The Gemini 2.5 Flash (`gemini-2.5-flash`) free tier gives you 5 requests per minute and 20 requests per day, more than enough for this workshop.

## Part 3 - Install the Gemini SDK

```bash
npm install @google/genai
```

> 🔗 [npmjs.com/package/@google/genai](https://www.npmjs.com/package/@google/genai) - Google's official JS/TS SDK for Gemini. Supports function calling and has experimental native MCP support.

## Part 4 - Build agent.js

Create a new file called `agent.js`. This replaces the hardcoded `callTool()` calls in `client.js` with a natural language loop driven by Gemini.

```
devcon-workshop/
├── .vscode/
│   └── mcp.json
├── node_modules/
├── .env
├── agent.js          ← new
├── aps-server.js
├── client.js
├── package.json
├── package-lock.json
└── server.js
```

### The Imports - What Each One Does

```javascript
import { GoogleGenAI } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import "dotenv/config";
```

| Import                          | What it does                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `GoogleGenAI`                   | The Gemini client. Sends prompts to the model and receives responses, including `functionCall` objects when the model wants to use a tool. |
| `Client`                        | The MCP client, same as in `client.js`. Connects to your MCP servers and calls tools on behalf of the LLM.                                 |
| `StreamableHTTPClientTransport` | Connects the MCP client to your servers over HTTP.                                                                                         |

### Section 1 - Connect to the MCP Servers and Discover Tools

```javascript
// Connect to both MCP servers
const workshopClient = new Client({
  name: "devcon-agent-workshop",
  version: "1.0.0",
});
await workshopClient.connect(
  new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp")),
);

const apsClient = new Client({ name: "devcon-agent-aps", version: "1.0.0" });
await apsClient.connect(
  new StreamableHTTPClientTransport(new URL("http://localhost:3001/mcp")),
);

// Merge tools from both servers
const { tools: workshopTools } = await workshopClient.listTools();
const { tools: apsTools } = await apsClient.listTools();
const allTools = [...workshopTools, ...apsTools];

// Build a lookup map: tool name → MCP client
const toolClientMap = {};
workshopTools.forEach((t) => (toolClientMap[t.name] = workshopClient));
apsTools.forEach((t) => (toolClientMap[t.name] = apsClient));

console.log(`Connected. ${allTools.length} tools available:`);
allTools.forEach((t) => console.log(`  - ${t.name}: ${t.description}`));
```

Just like `client.js`, the agent connects to both servers and merges the tool lists. The `toolClientMap` lets us route each tool call to the correct server. The agent loop uses it to dispatch calls.

### Section 2 - Convert MCP Tools to Gemini Function Declarations

Gemini's function calling API expects tools in a specific JSON schema format. We convert from MCP's `inputSchema` format to Gemini's `functionDeclarations` format:

```javascript
const geminiTools = [
  {
    functionDeclarations: allTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    })),
  },
];
```

This is the bridge between MCP and the LLM. The tool names and descriptions your MCP server advertises become the function names and descriptions that Gemini uses to decide which tool to call. **The quality of your tool descriptions directly affects how well the LLM chooses.**

### Section 3 - The Tool-Calling Loop

```javascript
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function ask(userPrompt) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`User: ${userPrompt}\n`);

  const messages = [{ role: "user", parts: [{ text: userPrompt }] }];

  while (true) {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: messages,
      config: { tools: geminiTools, temperature: 0 },
    });

    const candidate = response.candidates[0].content;
    const toolCallParts = candidate.parts.filter((p) => p.functionCall);

    if (toolCallParts.length === 0) {
      const finalText = candidate.parts.map((p) => p.text || "").join("");
      console.log(`Agent: ${finalText}`);
      return finalText;
    }

    const toolResults = [];
    for (const part of toolCallParts) {
      const { name, args } = part.functionCall;
      console.log(`  → Calling tool: ${name}(${JSON.stringify(args)})`);

      const result = await toolClientMap[name].callTool({
        name,
        arguments: args,
      });
      const resultText = result.content.map((c) => c.text || "").join("\n");
      console.log(`  ← Result: ${resultText.slice(0, 120)}...`);

      toolResults.push({
        functionResponse: {
          name,
          response: { output: resultText },
        },
      });
    }

    messages.push({ role: "model", parts: candidate.parts }); // messages are cumulative - we keep adding to the conversation
    messages.push({ role: "user", parts: toolResults });
  }
}
```

The loop works like a conversation:

1. We send the user prompt + available tools to Gemini
2. Gemini either answers or says "I need to call tool X with arguments Y"
3. We execute the tool call via MCP and add the result back to the conversation
4. Repeat until Gemini gives a final text answer with no more tool calls

**This is exactly what happens inside Claude, ChatGPT, and VS Code Copilot when they use tools. The loop is always there, whether the framework hides it or not.**

### Section 4 - Ask Questions in Natural Language

```javascript
await ask(
  "Create a new OSS bucket called 'devcon-test' with a persistent policy in the US region, then list my US buckets to confirm it was created.",
);

await workshopClient.close();
await apsClient.close();
```

Gemini reads the descriptions of all tools your server exposes and picks the right ones for each request. You don't specify tool names. You don't write orchestration code. The model decides.

[View complete `agent.js` in Source Code →](/code-states#state-6:agent.js)

## Part 5 - Run the Agent

```bash
# Terminal 1
node aps-server.js

# Terminal 2
node server.js

# Terminal 3 - the agent
node agent.js
```

## Challenges

**A - Add a system prompt** to shape the agent's personality. Before the `while` loop, prepend a system message to `messages`:

```javascript
const messages = [
  {
    role: "user",
    parts: [
      {
        text: "You are a concise assistant for AEC professionals. Always include units and be factual.",
      },
    ],
  },
  { role: "model", parts: [{ text: "Understood." }] },
  { role: "user", parts: [{ text: userPrompt }] },
];
```

**B - Build a simple REPL** so you can type questions interactively:

```javascript
import * as readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

await new Promise((resolve) => {
  rl.on("close", resolve);
  const loop = () =>
    rl.question("\nYou: ", async (input) => {
      if (input === "exit") return rl.close();
      await ask(input);
      loop();
    });
  loop();
});
```

Replace the hardcoded `ask()` calls with this loop and you have a working AI assistant backed by your entire MCP system.

[View complete solution `agent.js` in Source Code →](/code-states#state-7:agent.js)

## The Full Picture

```
              You (natural language)
                       ↓
                    agent.js
                       ↓  listTools() on startup (both servers)
                       ↓  generateContent() + tools on each message
                Gemini 2.5 Flash
                       ↓  functionCall: { name, args }
                    agent.js
                       ↓  toolClientMap[name].callTool()
              ┌───────┴──────────────┐
              │                      │
        server.js :3000    aps-server.js :3001
              │                      │
         Open-Meteo              APS API
          (HTTPS)
```

Every layer communicates over HTTP. Every tool is discovered dynamically. The agent routes each tool call to the right server using `toolClientMap`. That is MCP.
