from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from service_logic import ServiceConfig, TripAIService, load_env_files


class TripAIHTTPServer(ThreadingHTTPServer):
    def __init__(self, server_address: tuple[str, int], handler_class: type[BaseHTTPRequestHandler], service: TripAIService, config: ServiceConfig):
        super().__init__(server_address, handler_class)
        self.service = service
        self.service_config = config


class RequestHandler(BaseHTTPRequestHandler):
    server: TripAIHTTPServer

    def log_message(self, fmt: str, *args: Any) -> None:
        return

    def do_GET(self) -> None:
        if self.path == "/health":
            self._write_json(200, self.server.service.health())
            return
        self._write_json(404, {"message": "route not found"})

    def do_POST(self) -> None:
        if not self._authorize():
            self._write_json(401, {"message": "unauthorized"})
            return

        try:
            body = self._read_json()
        except ValueError as exc:
            self._write_json(400, {"message": str(exc)})
            return

        try:
            if self.path == "/v1/brief/enhance":
                payload = self.server.service.enhance_brief(body)
            elif self.path == "/v1/chat/enhance":
                payload = self.server.service.enhance_chat(body)
            elif self.path == "/v1/itinerary/explain":
                payload = self.server.service.explain_itinerary(body)
            else:
                self._write_json(404, {"message": "route not found"})
                return
        except Exception as exc:  # noqa: BLE001
            self._write_json(500, {"message": str(exc)})
            return

        self._write_json(200, payload)

    def _authorize(self) -> bool:
        service_key = self.server.service_config.service_key
        if not service_key:
            return True
        return self.headers.get("X-AI-Service-Key", "").strip() == service_key

    def _read_json(self) -> dict[str, Any]:
        content_length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError("invalid json body") from exc
        if not isinstance(payload, dict):
            raise ValueError("json body must be an object")
        return payload

    def _write_json(self, status: int, payload: dict[str, Any]) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    load_env_files()
    config = ServiceConfig.from_env()
    host = os.getenv("AI_SERVICE_HOST", "127.0.0.1").strip() or "127.0.0.1"
    port = int(os.getenv("AI_SERVICE_PORT", "8091") or "8091")
    service = TripAIService(config)
    server = TripAIHTTPServer((host, port), RequestHandler, service, config)
    print(f"trip-ai-service listening on http://{host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
