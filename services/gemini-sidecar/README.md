# Gemini Python Sidecar

## Responsibility

This module wraps the Gemini Python SDK as a minimal stdio JSON-RPC sidecar for `services/mcp-server`.

## Out Of Scope

- MCP tool orchestration
- Repository-level governance gates
- Product frontend implementation

## Dependencies

- Depends on `requirements.txt`
- Consumed by `services/mcp-server/src/providers/gemini-python-sidecar.ts`

## Runtime

This directory contains a minimal stdio JSON-RPC sidecar that wraps the `google-genai` Python SDK.

## Install

```bash
python -m pip install -r services/gemini-sidecar/requirements.txt
```

## Run

```bash
python services/gemini-sidecar/server.py
```

The server reads one JSON-RPC request per line from `stdin` and writes one JSON-RPC response per line to `stdout`.

## Methods

- `health`
  - Params: none
  - Result: sidecar and SDK version metadata.
- `list_models`
  - Params: `{ "limit"?: number }`
  - Result: `{ "models": string[], "count": number }`
- `generate_content`
  - Params: `{ "model": string, "contents": unknown, "system_instruction"?: string, "temperature"?: number, "tools"?: unknown[], "tool_choice"?: string | object, "function_responses"?: Array<{ "name": string, "response": object, "thought_signature"?: string, "call_id"?: string }>, "cached_content"?: string, "cache_ttl_seconds"?: number }`
  - Notes:
    - `function_responses` is validated and translated into request `contents` as `function_response` parts.
    - `cached_content` is forwarded via `GenerateContentConfig.cached_content` (not top-level request args).
    - `cache_ttl_seconds` must be a positive integer when provided; forwarding depends on SDK field support.
    - `tool_choice` remains backward-compatible and is mapped to `tool_config.function_calling_config` when possible.
  - Result: normalized text/function-calls/safety-decisions payload.
- `embed_content`
  - Params: `{ "model": string, "contents": unknown, "output_dimensionality"?: number }`
  - Result: `{ "embeddings": number[][], "count": number }`
- `computer_use_step`
  - Params: `{ "model": string, "contents": unknown, "system_instruction"?: string, "temperature"?: number, "excluded_predefined_functions"?: string[] }`
  - Result: normalized text/function-calls/safety-decisions payload.

## Error format

All failures follow JSON-RPC `error` shape:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32000,
    "message": "Gemini API request failed",
    "data": {
      "kind": "upstream_error",
      "error_type": "SomeException",
      "message": "..."
    }
  }
}
```
