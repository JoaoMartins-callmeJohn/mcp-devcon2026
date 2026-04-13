---
layout: home

hero:
  name: "MCP Workshop"
  text: "Model Context Protocol"
  tagline: Build, connect, and ship an MCP system end-to-end - from raw server/client communication to a production-ready agent with real design data.
  actions:
    - theme: brand
      text: Start Workshop →
      link: /prerequisites
    - theme: alt
      text: Download Slides
      link: ./Workshop%20MCP%20Devcon%2014-04-2026.pdf
      target: _blank
    - theme: alt
      text: YouTube Playlist (Coming Soon)
      link: "#"
      target: _blank

features:
  - title: "Prerequisites"
    details: Set up Node.js, VS Code, GitHub Copilot, and your Autodesk APS account before starting.
    link: /prerequisites
  - title: "1 - Establishing MCP Communication"
    details: Build an MCP server in Node.js and connect it to VS Code Copilot. Learn the protocol fundamentals.
    link: /1-establishing-mcp-communication
  - title: "2 - Linking with External Tools"
    details: Extend your server with a filesystem tool and a live weather API. Introduce MCP chaining with a second server.
    link: /2-linking-with-external-tools
  - title: "3 - Connecting Autodesk APS (2-Legged)"
    details: Integrate the Autodesk Platform Services API to list and create OSS buckets from Copilot.
    link: /3-connecting-autodesk-aps
  - title: "4 - User Authentication with APS (3-Legged)"
    details: Add OAuth login so your agent can call Autodesk APIs on behalf of a specific user.
    link: /4-three-legged-aps
  - title: "5 - Advanced: Custom Client & Agent"
    details: Build your own MCP client and wire in Gemini to create a fully autonomous LLM agent.
    link: /5-advanced
  - title: "Production Checklist"
    details: Auth hardening, secrets management, error handling, deployment, and observability before you ship.
    link: /production-checklist
  - title: "Source Code"
    details: Browse the complete code snapshots for every stage of the workshop.
    link: /code-states
---
