import { GoogleGenAI } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import "dotenv/config";

// --- Connect to both MCP servers ---
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

// --- Convert MCP tools to Gemini function declarations ---
const geminiTools = [
  {
    functionDeclarations: allTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    })),
  },
];

// --- Initialise Gemini ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- Tool-calling loop ---
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

    messages.push({ role: "model", parts: candidate.parts });
    messages.push({ role: "user", parts: toolResults });
  }
}

await ask("What is the weather like in London?");
await ask(
  "Create a new OSS bucket called 'devcon-test2' with a persistent policy in the US region, then list my US buckets to confirm it was created.",
);

await workshopClient.close();
await apsClient.close();
