"""JSON-RPC protocol helpers for the Gemini Python sidecar."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Mapping

JSONRPC_VERSION = "2.0"

PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603
UPSTREAM_ERROR = -32000

JsonRpcId = str | int | None


@dataclass(slots=True, frozen=True)
class JsonRpcRequest:
    request_id: JsonRpcId
    method: str
    params: Mapping[str, Any]


@dataclass(slots=True)
class JsonRpcError(Exception):
    code: int
    message: str
    data: Any = None
    request_id: JsonRpcId = None

    def to_error_object(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "code": self.code,
            "message": self.message,
        }
        if self.data is not None:
            payload["data"] = self.data
        return payload


def _is_valid_request_id(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, bool):
        return False
    return isinstance(value, (str, int))


def parse_request(payload: Any) -> JsonRpcRequest:
    if not isinstance(payload, Mapping):
        raise JsonRpcError(
            code=INVALID_REQUEST,
            message="Invalid Request",
            data={"kind": "invalid_request", "reason": "payload_must_be_object"},
        )

    request_id = payload.get("id")
    if not _is_valid_request_id(request_id):
        raise JsonRpcError(
            code=INVALID_REQUEST,
            message="Invalid Request",
            data={"kind": "invalid_request", "reason": "invalid_id"},
            request_id=None,
        )

    if payload.get("jsonrpc") != JSONRPC_VERSION:
        raise JsonRpcError(
            code=INVALID_REQUEST,
            message="Invalid Request",
            data={"kind": "invalid_request", "reason": "invalid_jsonrpc_version"},
            request_id=request_id,
        )

    method = payload.get("method")
    if not isinstance(method, str) or not method.strip():
        raise JsonRpcError(
            code=INVALID_REQUEST,
            message="Invalid Request",
            data={"kind": "invalid_request", "reason": "invalid_method"},
            request_id=request_id,
        )

    params = payload.get("params", {})
    if params is None:
        params = {}

    if not isinstance(params, Mapping):
        raise JsonRpcError(
            code=INVALID_PARAMS,
            message="Invalid params",
            data={"kind": "invalid_params", "reason": "params_must_be_object"},
            request_id=request_id,
        )

    return JsonRpcRequest(request_id=request_id, method=method, params=params)


def make_result_response(request_id: JsonRpcId, result: Any) -> dict[str, Any]:
    return {
        "jsonrpc": JSONRPC_VERSION,
        "id": request_id,
        "result": result,
    }


def make_error_response(error: JsonRpcError) -> dict[str, Any]:
    return {
        "jsonrpc": JSONRPC_VERSION,
        "id": error.request_id,
        "error": error.to_error_object(),
    }


def encode_message(payload: Mapping[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
