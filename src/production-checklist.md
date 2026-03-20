# Production Checklist

_What to Do Before You Ship Your MCP System_

## Introduction

Everything you have built in this workshop works locally. Processes talk to each other over `localhost`, credentials sit in a `.env` file, errors crash the terminal, and anyone on the same machine can call your `/mcp` endpoints without authentication.

None of that is acceptable in production. This document walks through every gap between what you have and what a production deployment requires.

The checklist is ordered by priority. Items at the top are non-negotiable for any deployment. Items toward the end are important but can be phased in.

## 1. HTTPS - Encrypt Everything in Transit

### Why

All MCP communication currently travels over plain HTTP. Anyone on the same network can read or modify messages between your client, your servers, and the APS API, including credentials, tool arguments, and responses.

### What to do

Place a **reverse proxy** in front of your Node.js servers to handle TLS termination. Your servers stay on HTTP internally; the proxy handles the encrypted connection from the outside world. Popular choices include **Nginx**, **Caddy** (which provisions and renews certificates automatically), and **cloud load balancers** (AWS, GCP, Azure). Once the proxy is in place, update the URLs your clients use to point at the HTTPS domain instead of `localhost`.

## 2. Authentication - Protect Your MCP Endpoints

### Why

Your MCP endpoints are currently open to anyone. In production, every request must prove it is authorised. Without this, anyone who discovers your server URLs can call your tools, read your APS data, or consume your Gemini quota.

### What to do

The simplest approach is **API key authentication**, suitable when your clients are internal services or controlled agents, not end users. Each server checks for a shared secret on every incoming request and rejects anything that doesn't carry the correct key. Each client includes that same key as a header in every outgoing MCP request. The key itself lives in your environment variables and stays out of source control.

For **user-facing agents** where each end user needs their own identity, use **OAuth 2.0** with JWT validation via an identity provider (Auth0, Okta, Azure AD).

## 3. Input Validation - Never Trust What Comes In

### Why

Your Zod schemas currently validate types (string, number, enum), but they do not constrain values. A tool that accepts a file path as a string could be called with a path traversal attack. A tool that accepts an ID could be called with an absurdly long string designed to break your upstream API.

### What to do

Tighten every schema with **length limits**, **pattern matching**, and **range constraints**. Every string input should have a maximum length. File paths should be validated against an allowed character set and blocked from containing relative path components. Numeric inputs should have minimum and maximum bounds. Enum inputs should stay as enums. Never accept free-form strings where a fixed set is expected. APS IDs should be validated against their known format before being passed to API calls.

## 4. Error Handling - Fail Gracefully, Log Everything

### Why

An unhandled error in a tool handler crashes the request with a raw stack trace, or worse, exposes internal details to the caller. In production, errors must be caught, logged internally with full detail, and returned to the client as clean, generic messages.

### What to do

Wrap every tool handler and your HTTP request handler in error handling logic. **Never return** stack traces, internal file paths, environment variable names, or raw API error bodies to the client. Distinguish between client errors (bad input) and server errors (upstream API failure) in your responses. Add **timeouts** to every external API call to prevent requests from hanging indefinitely.

## 5. Logging - Know What Is Happening

### Why

`console.log` works locally. In production you need **structured logs**: timestamps, severity levels, and request context, that can be searched, filtered, and aggregated across multiple processes and servers.

### What to do

Replace console calls with a structured logging library like **pino**. Each log entry should be a JSON object with a severity level, the tool name, and any relevant context. Assign a **request ID** to every incoming request so you can trace the full chain across servers. In production, pipe your logs to a log aggregator like **Datadog**, **Grafana Loki**, or **AWS CloudWatch**. Structured logs let you filter by tool, count calls per hour, set alerts on error rates, and trace individual agent sessions.

## 6. Process Management - Stay Running

### Why

Your servers currently run as bare `node` processes. If one crashes, it stays down until someone manually restarts it. If the machine reboots, nothing comes back up.

### What to do

Use a process manager like **PM2** to keep your Node.js services alive. A process manager gives you automatic restart on crash with backoff, persistence after SSH sessions end, auto-start on system boot, cluster mode for multi-core scaling, and built-in log rotation. Define all your services in a single configuration file so they can be started, stopped, and monitored together.

## 7. Health Check Endpoint - Know Your Servers Are Up

### Why

Your reverse proxy, load balancer, container orchestrator, and monitoring system all need a way to ask "is this server alive and ready?" without calling an actual MCP tool.

### What to do

Add a lightweight **health check route** to every server that returns its current status, version, and uptime. This endpoint should be accessible **without authentication** so monitoring tools don't need credentials. For servers that depend on external services (like your APS server), the health check can also verify that upstream credentials are still valid, returning an error status if they're not.

## 8. Session Support - Stateful Multi-Turn Agents

### Why

All your MCP servers currently run in **stateless mode**: every request is independent and the server remembers nothing between calls. For simple tool execution this is fine. But if your agent needs to maintain context across a long conversation, or support reconnecting clients without losing state, you need session management.

### What to do

Enable session ID generation on your MCP transports. When a new client connects, the server assigns a session ID and maps it to a persistent transport instance. Subsequent requests carrying that session ID are routed to the same transport, maintaining conversation state. For production persistence beyond process restarts, store sessions in an external store like **Redis**.

## 9. Rate Limiting - Protect Against Abuse

### Why

Without rate limiting, a misconfigured agent, a runaway loop, or a bad actor can exhaust your Gemini free tier, trigger Autodesk API throttling, or overwhelm your server with concurrent requests.

### What to do

Track the number of requests per client (typically by IP address) within a sliding time window and reject requests that exceed your threshold with a "too many requests" response. Adjust the limits based on your expected load and upstream API constraints. Check the APS rate limit documentation for specific thresholds on different Autodesk APIs.

## 10. Secrets Management - Never Hardcode Credentials

### Why

`.env` files are fine for local development. They should never be committed to git, deployed in plain text, or visible in CI/CD logs. In production, secrets are managed externally and injected at runtime.

### What to do

At minimum, use your hosting platform's built-in environment variable management. Every major platform (Railway, Render, Fly.io, AWS, GCP, Azure) provides this. Your code stays the same since it reads from `process.env` regardless of how the values got there. For teams, consider a dedicated secrets manager like **AWS Secrets Manager**, **HashiCorp Vault**, or **Doppler**. Regardless of the approach: keep `.env` in `.gitignore`, rotate secrets on a regular schedule, use different credentials per environment (development, staging, production), and audit which services have access to which secrets.

## Summary

| #   | Item                            | Impact                             | Effort     |
| --- | ------------------------------- | ---------------------------------- | ---------- |
| 1   | HTTPS via reverse proxy         | Critical: encrypts all traffic     | Low        |
| 2   | API key authentication          | Critical: locks down endpoints     | Low        |
| 3   | Input validation (tighter Zod)  | High: prevents injection & abuse   | Low        |
| 4   | Error handling & safe responses | High: no data leaks on failure     | Medium     |
| 5   | Structured logging              | High: essential for debugging      | Low        |
| 6   | Process manager                 | High: keeps servers alive          | Low        |
| 7   | Health check endpoints          | Medium: enables monitoring         | Low        |
| 8   | Session support                 | Medium: needed for stateful agents | Medium     |
| 9   | Rate limiting                   | Medium: protects API quotas        | Low        |
| 10  | Secrets management              | High: no credentials in code       | Low-Medium |
