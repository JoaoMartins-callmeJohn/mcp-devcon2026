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

  // Tool 3: get_weather
  server.registerTool(
    "get_weather",
    {
      description: "Returns the current temperature for a given city by name",
      inputSchema: { city: z.string().describe("Name of the city") },
    },
    async ({ city }) => {
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
      );
      const geoData = await geoRes.json();
      if (!geoData.results?.length)
        return { content: [{ type: "text", text: `City not found: ${city}` }] };
      const { latitude, longitude } = geoData.results[0];
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`,
      );
      const data = await res.json();
      const { temperature: temp, windspeed: wind } = data.current_weather;
      return {
        content: [
          {
            type: "text",
            text: `Weather in ${city}: ${temp}°C, wind ${wind} km/h`,
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
