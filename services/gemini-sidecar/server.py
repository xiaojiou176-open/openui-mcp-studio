"""Stdio JSON-RPC sidecar powered by google-genai."""

from __future__ import annotations

import base64
import importlib.metadata
import json
import os
import sys
from collections.abc import Mapping, Sequence
from typing import Any

try:
    from google import genai as _genai
    from google.genai import types as _types
    _GENAI_IMPORT_ERROR: Exception | None = None
except Exception as error:  # pragma: no cover - environment dependent
    _genai = None
    _types = None
    _GENAI_IMPORT_ERROR = error

from protocol import (
    INTERNAL_ERROR,
    INVALID_PARAMS,
    METHOD_NOT_FOUND,
    PARSE_ERROR,
    UPSTREAM_ERROR,
    JsonRpcError,
    JsonRpcRequest,
    encode_message,
    make_error_response,
    make_result_response,
    parse_request,
)

_CLIENT: Any | None = None


def _get_sdk_version() -> str:
    try:
        return importlib.metadata.version("google-genai")
    except Exception:
        return "unknown"


def _ensure_sdk_available() -> None:
    if _genai is not None and _types is not None:
        return

    raise JsonRpcError(
        code=UPSTREAM_ERROR,
        message="Gemini SDK is not available",
        data={
            "kind": "sdk_unavailable",
            "package": "google-genai",
            "reason": str(_GENAI_IMPORT_ERROR) if _GENAI_IMPORT_ERROR else "unknown",
        },
    )


def _resolve_api_key() -> str | None:
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if gemini_api_key:
        return gemini_api_key
    return None


def _get_client() -> Any:
    _ensure_sdk_available()
    global _CLIENT
    if _CLIENT is not None:
        return _CLIENT

    api_key = _resolve_api_key()
    _CLIENT = _genai.Client(api_key=api_key) if api_key else _genai.Client()
    return _CLIENT


def _to_plain(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, bytes):
        return {
            "mime_type": "application/octet-stream",
            "data": base64.b64encode(value).decode("ascii"),
        }
    if isinstance(value, Mapping):
        return {str(key): _to_plain(val) for key, val in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [_to_plain(item) for item in value]

    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        return _to_plain(model_dump(mode="json"))

    to_dict = getattr(value, "to_dict", None)
    if callable(to_dict):
        return _to_plain(to_dict())

    if hasattr(value, "__dict__"):
        return _to_plain(vars(value))

    return repr(value)


def _require_string(params: Mapping[str, Any], key: str) -> str:
    value = params.get(key)
    if not isinstance(value, str) or not value.strip():
        raise JsonRpcError(
            code=INVALID_PARAMS,
            message="Invalid params",
            data={"kind": "invalid_params", "reason": f"{key}_must_be_non_empty_string"},
        )
    return value.strip()


def _optional_number(params: Mapping[str, Any], key: str) -> float | None:
    value = params.get(key)
    if value is None:
        return None
    if isinstance(value, bool):
        raise JsonRpcError(
            code=INVALID_PARAMS,
            message="Invalid params",
            data={"kind": "invalid_params", "reason": f"{key}_must_be_number"},
        )
    if isinstance(value, (int, float)):
        return float(value)
    raise JsonRpcError(
        code=INVALID_PARAMS,
        message="Invalid params",
        data={"kind": "invalid_params", "reason": f"{key}_must_be_number"},
    )


def _optional_int(
    params: Mapping[str, Any],
    key: str,
    default: int,
    minimum: int,
    maximum: int,
) -> int:
    value = params.get(key, default)
    if isinstance(value, bool) or not isinstance(value, int):
        raise JsonRpcError(
            code=INVALID_PARAMS,
            message="Invalid params",
            data={"kind": "invalid_params", "reason": f"{key}_must_be_integer"},
        )
    bounded = max(minimum, min(maximum, value))
    return bounded


def _optional_string_list(params: Mapping[str, Any], key: str) -> list[str]:
    value = params.get(key)
    if value is None:
        return []
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes, bytearray)):
        raise JsonRpcError(
            code=INVALID_PARAMS,
            message="Invalid params",
            data={"kind": "invalid_params", "reason": f"{key}_must_be_string_array"},
        )

    parsed: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise JsonRpcError(
                code=INVALID_PARAMS,
                message="Invalid params",
                data={"kind": "invalid_params", "reason": f"{key}_must_be_string_array"},
            )
        parsed.append(item.strip())
    return parsed


def _optional_positive_int(params: Mapping[str, Any], key: str) -> int | None:
    value = params.get(key)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise JsonRpcError(
            code=INVALID_PARAMS,
            message="Invalid params",
            data={"kind": "invalid_params", "reason": f"{key}_must_be_positive_integer"},
        )
    return value


def _normalize_function_responses(
    params: Mapping[str, Any],
) -> list[Mapping[str, Any]]:
    raw = params.get("function_responses")
    if raw is None:
        return []
    if not isinstance(raw, Sequence) or isinstance(raw, (str, bytes, bytearray)):
        raise JsonRpcError(
            code=INVALID_PARAMS,
            message="Invalid params",
            data={"kind": "invalid_params", "reason": "function_responses_must_be_array"},
        )

    normalized: list[Mapping[str, Any]] = []
    for item in raw:
        if not isinstance(item, Mapping):
            raise JsonRpcError(
                code=INVALID_PARAMS,
                message="Invalid params",
                data={"kind": "invalid_params", "reason": "function_responses_item_must_be_object"},
            )

        name = item.get("name")
        if not isinstance(name, str) or not name.strip():
            raise JsonRpcError(
                code=INVALID_PARAMS,
                message="Invalid params",
                data={"kind": "invalid_params", "reason": "function_responses_name_must_be_non_empty_string"},
            )

        response = item.get("response")
        if not isinstance(response, Mapping):
            raise JsonRpcError(
                code=INVALID_PARAMS,
                message="Invalid params",
                data={"kind": "invalid_params", "reason": "function_responses_response_must_be_object"},
            )

        function_response: dict[str, Any] = {
            "name": name.strip(),
            "response": dict(response),
        }

        call_id = item.get("call_id")
        if call_id is not None:
            if not isinstance(call_id, str) or not call_id.strip():
                raise JsonRpcError(
                    code=INVALID_PARAMS,
                    message="Invalid params",
                    data={"kind": "invalid_params", "reason": "function_responses_call_id_must_be_non_empty_string"},
                )
            function_response["call_id"] = call_id.strip()

        thought_signature = item.get("thought_signature")
        if thought_signature is not None:
            if not isinstance(thought_signature, str) or not thought_signature.strip():
                raise JsonRpcError(
                    code=INVALID_PARAMS,
                    message="Invalid params",
                    data={"kind": "invalid_params", "reason": "function_responses_thought_signature_must_be_non_empty_string"},
                )
            function_response["thought_signature"] = thought_signature.strip()

        normalized.append(function_response)

    return normalized


def _inject_function_responses_into_contents(
    contents: Any,
    function_responses: Sequence[Mapping[str, Any]],
) -> Any:
    if not function_responses:
        return contents

    if isinstance(contents, Sequence) and not isinstance(contents, (str, bytes, bytearray)):
        content_list = list(contents)
    elif isinstance(contents, Mapping):
        content_list = [dict(contents)]
    else:
        content_list = [{"role": "user", "parts": [{"text": str(contents)}]}]

    for function_response in function_responses:
        content_list.append(
            {
                "role": "user",
                "parts": [{"function_response": dict(function_response)}],
            }
        )
    return content_list


def _coerce_function_calling_config(tool_choice: str | Mapping[str, Any]) -> Mapping[str, Any] | None:
    if isinstance(tool_choice, str):
        raw_mode = tool_choice.strip().lower()
        mode_map = {
            "auto": "AUTO",
            "none": "NONE",
            "any": "ANY",
            "required": "ANY",
        }
        mapped_mode = mode_map.get(raw_mode)
        if mapped_mode is None:
            raise JsonRpcError(
                code=INVALID_PARAMS,
                message="Invalid params",
                data={"kind": "invalid_params", "reason": "tool_choice_string_not_supported"},
            )
        return {"mode": mapped_mode}

    explicit_cfg = tool_choice.get("function_calling_config")
    if isinstance(explicit_cfg, Mapping):
        config: dict[str, Any] = {}
        mode = explicit_cfg.get("mode")
        if mode is not None:
            if not isinstance(mode, str) or not mode.strip():
                raise JsonRpcError(
                    code=INVALID_PARAMS,
                    message="Invalid params",
                    data={"kind": "invalid_params", "reason": "tool_choice_mode_must_be_non_empty_string"},
                )
            config["mode"] = mode.strip().upper()

        allowed_names = explicit_cfg.get("allowed_function_names")
        if allowed_names is not None:
            if not isinstance(allowed_names, Sequence) or isinstance(allowed_names, (str, bytes, bytearray)):
                raise JsonRpcError(
                    code=INVALID_PARAMS,
                    message="Invalid params",
                    data={"kind": "invalid_params", "reason": "tool_choice_allowed_function_names_must_be_string_array"},
                )
            parsed_names: list[str] = []
            for item in allowed_names:
                if not isinstance(item, str) or not item.strip():
                    raise JsonRpcError(
                        code=INVALID_PARAMS,
                        message="Invalid params",
                        data={"kind": "invalid_params", "reason": "tool_choice_allowed_function_names_must_be_string_array"},
                    )
                parsed_names.append(item.strip())
            config["allowed_function_names"] = parsed_names

        return config or None

    selection_type = tool_choice.get("type")
    if isinstance(selection_type, str):
        normalized_type = selection_type.strip().lower()
        if normalized_type == "function":
            function_payload = tool_choice.get("function")
            if not isinstance(function_payload, Mapping):
                raise JsonRpcError(
                    code=INVALID_PARAMS,
                    message="Invalid params",
                    data={"kind": "invalid_params", "reason": "tool_choice_function_must_be_object"},
                )
            function_name = function_payload.get("name")
            if not isinstance(function_name, str) or not function_name.strip():
                raise JsonRpcError(
                    code=INVALID_PARAMS,
                    message="Invalid params",
                    data={"kind": "invalid_params", "reason": "tool_choice_function_name_must_be_non_empty_string"},
                )
            return {"mode": "ANY", "allowed_function_names": [function_name.strip()]}
        if normalized_type in {"auto", "none", "required", "any"}:
            return _coerce_function_calling_config(normalized_type)

    return None


def _build_tool_config(tool_choice: str | Mapping[str, Any]) -> Any | None:
    function_calling_config = _coerce_function_calling_config(tool_choice)
    if function_calling_config is None:
        return None

    function_calling_cls = getattr(_types, "FunctionCallingConfig", None)
    tool_config_cls = getattr(_types, "ToolConfig", None)
    if callable(function_calling_cls) and callable(tool_config_cls):
        return tool_config_cls(function_calling_config=function_calling_cls(**dict(function_calling_config)))

    return {"function_calling_config": dict(function_calling_config)}


def _extract_parts(plain_response: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    candidates = plain_response.get("candidates")
    if not isinstance(candidates, Sequence):
        return []

    collected: list[Mapping[str, Any]] = []
    for candidate in candidates:
        if not isinstance(candidate, Mapping):
            continue
        content = candidate.get("content")
        if not isinstance(content, Mapping):
            continue
        parts = content.get("parts")
        if not isinstance(parts, Sequence):
            continue
        for part in parts:
            if isinstance(part, Mapping):
                collected.append(part)
    return collected


def _normalize_generate_response(response: Any) -> Mapping[str, Any]:
    plain = _to_plain(response)
    if not isinstance(plain, Mapping):
        return {"text": "", "function_calls": [], "safety_decisions": []}

    parts = _extract_parts(plain)
    text_chunks: list[str] = []
    function_calls: list[Mapping[str, Any]] = []
    safety_decisions: list[Any] = []

    for part in parts:
        text = part.get("text")
        if isinstance(text, str) and text.strip():
            text_chunks.append(text.strip())

        function_call = part.get("function_call")
        if isinstance(function_call, Mapping):
            function_calls.append(function_call)

        safety_decision = part.get("safety_decision")
        if safety_decision is not None:
            safety_decisions.append(safety_decision)

    text = "\n".join(text_chunks).strip()
    return {
        "text": text,
        "function_calls": function_calls,
        "safety_decisions": safety_decisions,
    }


def _build_generate_config(
    params: Mapping[str, Any],
    with_computer_use: bool,
) -> Any | None:
    _ensure_sdk_available()
    config_data: dict[str, Any] = {}

    system_instruction = params.get("system_instruction")
    if system_instruction is not None:
        if not isinstance(system_instruction, str):
            raise JsonRpcError(
                code=INVALID_PARAMS,
                message="Invalid params",
                data={"kind": "invalid_params", "reason": "system_instruction_must_be_string"},
            )
        config_data["system_instruction"] = system_instruction

    temperature = _optional_number(params, "temperature")
    if temperature is not None:
        config_data["temperature"] = temperature

    thinking_level = params.get("thinking_level")
    include_thoughts = params.get("include_thoughts")
    thinking_kwargs: dict[str, Any] = {}
    if isinstance(thinking_level, str) and thinking_level.strip().lower() in {"low", "high"}:
        thinking_kwargs["thinking_level"] = thinking_level.strip().lower()
    if isinstance(include_thoughts, bool):
        thinking_kwargs["include_thoughts"] = include_thoughts
    if thinking_kwargs:
        config_data["thinking_config"] = _types.ThinkingConfig(**thinking_kwargs)

    response_mime_type = params.get("response_mime_type")
    if isinstance(response_mime_type, str) and response_mime_type.strip():
        config_data["response_mime_type"] = response_mime_type.strip()

    response_json_schema = params.get("response_json_schema")
    if isinstance(response_json_schema, Mapping):
        config_data["response_json_schema"] = dict(response_json_schema)

    cached_content = params.get("cached_content")
    if isinstance(cached_content, str) and cached_content.strip():
        config_data["cached_content"] = cached_content.strip()

    # Keep validating this legacy input for compatibility, but only forward it
    # when the installed SDK version supports the field.
    cache_ttl_seconds = _optional_positive_int(params, "cache_ttl_seconds")
    if cache_ttl_seconds is not None:
        annotations = getattr(_types.GenerateContentConfig, "__annotations__", {})
        if isinstance(annotations, Mapping) and "cache_ttl_seconds" in annotations:
            config_data["cache_ttl_seconds"] = cache_ttl_seconds

    tools = params.get("tools")
    if isinstance(tools, Sequence) and not isinstance(tools, (str, bytes, bytearray)):
        config_data["tools"] = list(tools)

    tool_choice = params.get("tool_choice")
    if isinstance(tool_choice, (str, Mapping)):
        tool_config = _build_tool_config(tool_choice)
        if tool_config is not None:
            config_data["tool_config"] = tool_config
        else:
            config_data["tool_choice"] = tool_choice

    if with_computer_use:
        excluded = _optional_string_list(params, "excluded_predefined_functions")
        computer_use_kwargs: dict[str, Any] = {
            "environment": _types.Environment.ENVIRONMENT_BROWSER,
        }
        if excluded:
            computer_use_kwargs["excluded_predefined_functions"] = excluded

        config_data["tools"] = [
            _types.Tool(computer_use=_types.ComputerUse(**computer_use_kwargs)),
        ]

    if not config_data:
        return None
    return _types.GenerateContentConfig(**config_data)


def _extract_embedding_vectors(plain_response: Any) -> list[list[float]]:
    if not isinstance(plain_response, Mapping):
        return []

    raw_embeddings = plain_response.get("embeddings")
    if not isinstance(raw_embeddings, Sequence):
        maybe_single = plain_response.get("embedding")
        raw_embeddings = [maybe_single] if maybe_single is not None else []

    vectors: list[list[float]] = []
    for embedding in raw_embeddings:
        if not isinstance(embedding, Mapping):
            continue
        values = embedding.get("values")
        if not isinstance(values, Sequence):
            continue

        vector: list[float] = []
        for value in values:
            if isinstance(value, (int, float)):
                vector.append(float(value))
        if vector:
            vectors.append(vector)
    return vectors


def _upstream_error(error: Exception) -> JsonRpcError:
    status = getattr(error, "status", None)
    status_code = getattr(error, "status_code", status)
    return JsonRpcError(
        code=UPSTREAM_ERROR,
        message="Gemini API request failed",
        data={
            "kind": "upstream_error",
            "error_type": type(error).__name__,
            "message": str(error),
            "status": status_code if isinstance(status_code, (int, float, str)) else None,
        },
    )


def _handle_health(_: Mapping[str, Any]) -> Mapping[str, Any]:
    return {
        "status": "ok",
        "sdk": {
            "name": "google-genai",
            "version": _get_sdk_version(),
            "available": _genai is not None and _types is not None,
        },
    }


def _handle_list_models(params: Mapping[str, Any]) -> Mapping[str, Any]:
    limit = _optional_int(params, "limit", default=50, minimum=1, maximum=200)
    client = _get_client()

    names: list[str] = []
    try:
        pager = client.models.list(config={"page_size": limit})
        for model in pager:
            plain = _to_plain(model)
            if not isinstance(plain, Mapping):
                continue
            name = plain.get("name")
            if isinstance(name, str) and name.strip():
                names.append(name.strip())
            if len(names) >= limit:
                break
    except Exception as error:
        raise _upstream_error(error) from error

    deduped = sorted(set(names))
    return {
        "models": deduped,
        "count": len(deduped),
    }


def _handle_generate_content(params: Mapping[str, Any]) -> Mapping[str, Any]:
    model = _require_string(params, "model")
    if "contents" not in params:
        raise JsonRpcError(
            code=INVALID_PARAMS,
            message="Invalid params",
            data={"kind": "invalid_params", "reason": "contents_is_required"},
        )

    function_responses = _normalize_function_responses(params)
    contents = _inject_function_responses_into_contents(params["contents"], function_responses)
    config = _build_generate_config(params, with_computer_use=False)
    client = _get_client()
    try:
        request: dict[str, Any] = {
            "model": model,
            "contents": contents,
            "config": config,
        }
        response = client.models.generate_content(**request)
    except Exception as error:
        raise _upstream_error(error) from error

    return _normalize_generate_response(response)


def _handle_embed_content(params: Mapping[str, Any]) -> Mapping[str, Any]:
    model = _require_string(params, "model")
    if "contents" not in params:
        raise JsonRpcError(
            code=INVALID_PARAMS,
            message="Invalid params",
            data={"kind": "invalid_params", "reason": "contents_is_required"},
        )

    contents = params["contents"]
    config_data: dict[str, Any] = {}
    output_dimensionality = params.get("output_dimensionality")
    if output_dimensionality is not None:
        if (
            isinstance(output_dimensionality, bool)
            or not isinstance(output_dimensionality, int)
            or output_dimensionality <= 0
        ):
            raise JsonRpcError(
                code=INVALID_PARAMS,
                message="Invalid params",
                data={
                    "kind": "invalid_params",
                    "reason": "output_dimensionality_must_be_positive_integer",
                },
            )
        config_data["output_dimensionality"] = output_dimensionality

    _ensure_sdk_available()
    config = _types.EmbedContentConfig(**config_data) if config_data else None

    client = _get_client()
    try:
        response = client.models.embed_content(
            model=model,
            contents=contents,
            config=config,
        )
    except Exception as error:
        raise _upstream_error(error) from error

    vectors = _extract_embedding_vectors(_to_plain(response))
    return {
        "embeddings": vectors,
        "count": len(vectors),
    }


def _handle_computer_use_step(params: Mapping[str, Any]) -> Mapping[str, Any]:
    model = _require_string(params, "model")
    if "contents" not in params:
        raise JsonRpcError(
            code=INVALID_PARAMS,
            message="Invalid params",
            data={"kind": "invalid_params", "reason": "contents_is_required"},
        )

    contents = params["contents"]
    config = _build_generate_config(params, with_computer_use=True)
    client = _get_client()
    try:
        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=config,
        )
    except Exception as error:
        raise _upstream_error(error) from error

    return _normalize_generate_response(response)


METHODS = {
    "health": _handle_health,
    "list_models": _handle_list_models,
    "generate_content": _handle_generate_content,
    "embed_content": _handle_embed_content,
    "computer_use_step": _handle_computer_use_step,
}


def _dispatch(request: JsonRpcRequest) -> Any:
    handler = METHODS.get(request.method)
    if handler is None:
        raise JsonRpcError(
            code=METHOD_NOT_FOUND,
            message="Method not found",
            data={"kind": "method_not_found", "method": request.method},
            request_id=request.request_id,
        )

    try:
        return handler(request.params)
    except JsonRpcError as error:
        if error.request_id is None:
            error.request_id = request.request_id
        raise
    except Exception as error:
        raise JsonRpcError(
            code=INTERNAL_ERROR,
            message="Internal error",
            data={
                "kind": "internal_error",
                "error_type": type(error).__name__,
                "message": str(error),
            },
            request_id=request.request_id,
        ) from error


def _write_message(payload: Mapping[str, Any]) -> None:
    sys.stdout.write(encode_message(payload))
    sys.stdout.write("\n")
    sys.stdout.flush()


def main() -> int:
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        try:
            decoded = json.loads(line)
        except Exception as error:
            rpc_error = JsonRpcError(
                code=PARSE_ERROR,
                message="Parse error",
                data={"kind": "parse_error", "message": str(error)},
                request_id=None,
            )
            _write_message(make_error_response(rpc_error))
            continue

        try:
            request = parse_request(decoded)
            result = _dispatch(request)
            _write_message(make_result_response(request.request_id, result))
        except JsonRpcError as error:
            _write_message(make_error_response(error))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
