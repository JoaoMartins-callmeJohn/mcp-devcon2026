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

  // Tool 3: estimate_cost (Ch.01 challenge)
  server.registerTool(
    "estimate_cost",
    {
      description:
        "Estimates the cost of a building material based on volume. Returns a formatted cost breakdown.",
      inputSchema: {
        material: z
          .enum(["concrete", "steel", "timber", "glass"])
          .describe("Building material"),
        volume: z.number().describe("Volume in cubic metres"),
      },
    },
    async ({ material, volume }) => {
      const rates = { concrete: 150, steel: 950, timber: 400, glass: 1200 };
      const rate = rates[material];
      const total = rate * volume;
      return {
        content: [
          {
            type: "text",
            text: `Cost estimate: ${volume} m³ of ${material} at $${rate}/m³ = $${total.toLocaleString()}`,
          },
        ],
      };
    },
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
