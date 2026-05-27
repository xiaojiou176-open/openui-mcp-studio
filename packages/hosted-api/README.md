# @openui/hosted-api

Internal source package for the self-hosted OpenUIStudio HTTP runtime.

This directory is the implementation home for the hosted product line, but the
public entrypoint stays the root repo CLI:

```bash
OpenUIStudio hosted info
OpenUIStudio hosted openapi
OpenUIStudio hosted serve
```

Current scope:

- self-hosted HTTP runtime
- public discovery endpoints
- bearer-token protected workflow and tool endpoints
- CORS-ready JSON responses for token-bearing browser callers
- in-memory rate limiting
- structured request logging

Not current scope:

- managed hosted SaaS
- marketplace plugin runtime
- remote write-capable MCP control plane
