import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

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

const { tools: workshopTools } = await workshopClient.listTools();
const { tools: apsTools } = await apsClient.listTools();
const allTools = [...workshopTools, ...apsTools];

console.log("\nAvailable tools:");
allTools.forEach((tool) => {
  console.log(`  - ${tool.name}: ${tool.description}`);
});

// Chapter 01 — add
const addResult = await workshopClient.callTool({
  name: "add",
  arguments: { a: 12, b: 30 },
});
console.log("\nadd(12, 30):", addResult.content[0].text);

// Chapter 01 — greet
const greetResult = await workshopClient.callTool({
  name: "greet",
  arguments: { name: "Nabil", language: "spanish" },
});
console.log("greet():", greetResult.content[0].text);

// Chapter 01 — bim_element
const bimResult = await workshopClient.callTool({
  name: "bim_element",
  arguments: { id: "W-001", type: "Wall", material: "Concrete", level: "L1" },
});
console.log("bim_element():", bimResult.content[0].text);

// Chapter 02 — get_weather
const weatherResult = await workshopClient.callTool({
  name: "get_weather",
  arguments: { city: "Amsterdam" },
});
console.log("get_weather():", weatherResult.content[0].text);

// Chapter 03 — create_bucket then list_buckets (directly on APS server)
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
