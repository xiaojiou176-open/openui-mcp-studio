# @openui/sdk

Public SDK for the self-hosted OpenUI Hosted API surface.

## Install

```bash
npm install /ABS/PATH/openui-mcp-studio/packages/sdk
```

Registry publication remains operator-only. The current repo truth is a
pack/install-ready SDK package inside this repository.

## Use

```js
import { createOpenuiHostedClient } from "@openui/sdk";

const client = createOpenuiHostedClient({
  baseUrl: "http://127.0.0.1:7878",
  token: "replace-with-your-bearer-token",
});
```

## Current scope

- typed client for the self-hosted API discovery endpoints
- authenticated workflow summary
- authenticated tool discovery and tool execution
- local pack/install proof from this repository

## Current non-goals

- npm registry publication
- replacing the local stdio MCP runtime
- implying a managed hosted SaaS
