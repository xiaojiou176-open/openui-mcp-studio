#!/usr/bin/env python3
"""Health/smoke checker for Gemini python sidecar."""

from __future__ import annotations

import argparse
import json
import os
import selectors
import ssl
import subprocess
import urllib.error
import urllib.request
from pathlib import Path


def read_line_with_timeout(proc: subprocess.Popen[str], timeout_seconds: float, method: str) -> str:
  assert proc.stdout is not None
  selector = selectors.DefaultSelector()
  try:
    selector.register(proc.stdout, selectors.EVENT_READ)
    events = selector.select(timeout_seconds)
    if not events:
      raise TimeoutError(f"Timed out waiting for sidecar response for method={method}")
    line = proc.stdout.readline()
  finally:
    selector.close()

  if not line:
    raise RuntimeError(f"No response from sidecar for method={method}")
  return line


def read_stderr_tail_nonblocking(
  proc: subprocess.Popen[str],
  timeout_seconds: float = 0.5,
) -> tuple[str, dict[str, object] | None]:
  if proc.stderr is None:
    return "", None

  selector = selectors.DefaultSelector()
  try:
    selector.register(proc.stderr, selectors.EVENT_READ)
    events = selector.select(timeout_seconds)
    if not events:
      return "", None

    data = proc.stderr.read()
    if not data:
      return "", None

    return data[-2000:], None
  except Exception as exc:  # noqa: BLE001
    return "", {
      "error_type": type(exc).__name__,
      "error": str(exc),
    }
  finally:
    selector.close()


def rpc_call(
  proc: subprocess.Popen[str],
  request_id: int,
  method: str,
  params: dict,
  timeout_seconds: float,
) -> dict:
  req = {
    "jsonrpc": "2.0",
    "id": request_id,
    "method": method,
    "params": params,
  }
  assert proc.stdin is not None
  proc.stdin.write(json.dumps(req) + "\n")
  proc.stdin.flush()
  line = read_line_with_timeout(proc, timeout_seconds, method)
  payload = json.loads(line)
  if "error" in payload:
    raise RuntimeError(f"Sidecar error for {method}: {json.dumps(payload['error'])}")
  return payload


def outbound_probe(timeout_seconds: float) -> dict[str, object]:
  targets = [
    "https://generativelanguage.googleapis.com",
    "https://ai.google.dev",
  ]
  results: list[dict[str, object]] = []
  for url in targets:
    try:
      with urllib.request.urlopen(
        url,
        timeout=timeout_seconds,
        context=ssl.create_default_context(),
      ) as response:
        results.append({"url": url, "ok": True, "status": response.status})
    except urllib.error.HTTPError as exc:
      results.append({"url": url, "ok": True, "status": exc.code})
    except Exception as exc:  # noqa: BLE001
      results.append(
        {
          "url": url,
          "ok": False,
          "error_type": type(exc).__name__,
          "error": str(exc),
        }
      )
  return {
    "ok": all(item.get("ok") for item in results),
    "results": results,
  }


def main() -> int:
  parser = argparse.ArgumentParser()
  parser.add_argument("--smoke", action="store_true", help="run list_models smoke call")
  parser.add_argument(
    "--rpc-timeout-ms",
    type=int,
    default=int(os.environ.get("OPENUI_GEMINI_SIDECAR_HEALTH_TIMEOUT_MS", "5000")),
    help="timeout in milliseconds for each sidecar RPC read",
  )
  args = parser.parse_args()
  rpc_timeout_ms = max(1, args.rpc_timeout_ms)

  repo_root = Path(__file__).resolve().parents[1]
  server_path = repo_root / "python" / "sidecar" / "server.py"
  python_bin = os.environ.get("OPENUI_GEMINI_PYTHON_BIN", "python3")

  proc = subprocess.Popen(
    [python_bin, str(server_path)],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
    env=os.environ.copy(),
  )

  try:
    health = rpc_call(proc, 1, "health", {}, rpc_timeout_ms / 1000)
    sdk = health.get("result", {}).get("sdk", {})
    print(json.dumps({"ok": True, "method": "health", "sdk": sdk}, ensure_ascii=True))

    if args.smoke:
      if not os.environ.get("GEMINI_API_KEY"):
        print(json.dumps({"ok": False, "reason": "GEMINI_API_KEY missing for smoke"}, ensure_ascii=True))
        return 1
      probe = outbound_probe(rpc_timeout_ms / 1000)
      if not probe["ok"]:
        print(
          json.dumps(
            {
              "ok": False,
              "reason": "gemini_outbound_probe_failed",
              "probe": probe["results"],
              "hint": "Verify outbound HTTPS access to generativelanguage.googleapis.com / ai.google.dev or configure HTTP(S)_PROXY.",
            },
            ensure_ascii=True,
          )
        )
        return 1
      smoke_results: list[dict[str, object]] = []
      methods = [
        (2, "list_models", {"limit": 3}),
        (3, "generate_content", {"model": "gemini-2.5-flash", "contents": "Reply with OK only"}),
      ]
      for request_id, method, params in methods:
        try:
          result = rpc_call(proc, request_id, method, params, rpc_timeout_ms / 1000)
          if method == "list_models":
            smoke_results.append(
              {
                "ok": True,
                "method": method,
                "count": result.get("count", 0),
              }
            )
          else:
            smoke_results.append(
              {
                "ok": True,
                "method": method,
                "text": result.get("text", ""),
              }
            )
        except Exception as exc:  # noqa: BLE001
          smoke_results.append(
            {
              "ok": False,
              "method": method,
              "error": str(exc),
            }
          )
      print(json.dumps({"ok": all(item.get("ok") for item in smoke_results), "results": smoke_results}, ensure_ascii=True))
      if not all(item.get("ok") for item in smoke_results):
        return 1

    return 0
  except Exception as exc:  # noqa: BLE001
    stderr_tail, stderr_read_error = read_stderr_tail_nonblocking(proc)
    payload = {
      "ok": False,
      "error": str(exc),
      "stderr": stderr_tail,
    }
    if stderr_read_error is not None:
      payload["stderr_read_error"] = stderr_read_error
    print(json.dumps(payload, ensure_ascii=True))
    return 1
  finally:
    if proc.poll() is None:
      proc.terminate()
      try:
        proc.wait(timeout=1)
      except subprocess.TimeoutExpired:
        proc.kill()


if __name__ == "__main__":
  raise SystemExit(main())
