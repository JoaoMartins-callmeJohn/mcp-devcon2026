import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import http from "node:http";

function createServer() {
  const server = new McpServer({
    name: "devcon-workshop-server",
    version: "1.0.0",
  });

  // Tool 1: add
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

  // Tool 2: greet
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
      return { content: [{ type: "text", text: greetings[language] }] };
    },
  );

  // Tool 3: bim_element (Ch.01 challenge)
  server.registerTool(
    "bim_element",
    {
      description: "Returns a formatted summary of a BIM element",
      inputSchema: {
        id: z.string().describe("Element ID, e.g. W-001"),
        type: z.string().describe("Element type, e.g. Wall"),
        material: z.string().describe("Material, e.g. Concrete"),
        level: z.string().describe("Level, e.g. L1"),
      },
    },
    async ({ id, type, material, level }) => ({
      content: [
        {
          type: "text",
          text: `[${id}] ${type} | Material: ${material} | Level: ${level}`,
        },
      ],
    }),
  );

  return server;
}

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
