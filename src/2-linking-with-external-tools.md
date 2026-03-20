# Linking with External Tools

_Connecting Your MCP Server to the Outside World_

## Where We Left Off

In the previous chapter you built a **self-running MCP server** (`server.js`) with two tools, `add` and `greet`, and connected VS Code Copilot to it as the MCP host. Both tools were self-contained: they computed everything locally.

In this chapter we go further: your server's tools will call **external APIs and other MCP servers**, turning your server into a hub that bridges Copilot to the outside world.

```
Before:   VS Code Copilot → Your MCP Server → local logic
Now:      VS Code Copilot → Your MCP Server → external APIs
```

## Calling an External API from a Tool

The simplest external link is calling a public HTTP API directly from inside a tool handler.

We will use **Open-Meteo** - a free, no-API-key-required weather API.

> 🔗 [open-meteo.com](https://open-meteo.com) - free, no sign-up, no API key, no rate limit for basic use.

No new packages needed - Node 18+ has `fetch` built in.

### Section 1 - The tool definition and schema

We'll register one tool in this part:

- **`get_weather`**: takes a `city` name and returns the current temperature and wind speed. It resolves the city to coordinates using Open-Meteo's free geocoding API, then fetches the current weather for those coordinates. Two API calls, no key required.

```javascript
server.registerTool(
  "get_weather",
  {
    description: "Returns the current temperature for a given city by name",
    inputSchema: {
      city: z.string().describe("Name of the city"),
    },
  },
  // handler - see Section 2
);
```

The tool only needs a city name. The handler resolves coordinates internally using Open-Meteo's free geocoding API, so callers - including LLM agents - just say "Amsterdam" and the tool handles the rest.

### Section 2 - The handler: calling the external API

```javascript
async ({ city }) => {
  // Step 1: resolve city name to coordinates using Open-Meteo's free geocoding API
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`;
  const geoRes = await fetch(geoUrl);
  const geoData = await geoRes.json();
  if (!geoData.results?.length) {
    return { content: [{ type: "text", text: `City not found: ${city}` }] };
  }
  const { latitude, longitude } = geoData.results[0];

  // Step 2: fetch current weather for those coordinates
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${latitude}&longitude=${longitude}&current_weather=true`;

  const response = await fetch(url);
  const data = await response.json();

  const temp = data.current_weather.temperature;
  const wind = data.current_weather.windspeed;

  return {
    content: [
      {
        type: "text",
        text: `Weather in ${city}: ${temp}°C, wind ${wind} km/h`,
      },
    ],
  };
},
```

Two API calls, zero extra packages - both Open-Meteo endpoints are free with no key required. The client sees a normal tool response and has no idea what happened inside.

[View complete `server.js` in Source Code →](/code-states#state-3:server.js)

## Try it in Copilot Chat

Start the server (`node server.js`), then open the Command Palette and run **MCP: List Servers → Restart**. Then open Copilot Chat in **Agent mode** and ask:

> "What's the weather in Amsterdam?"

Copilot calls your `get_weather` tool and returns the result.
