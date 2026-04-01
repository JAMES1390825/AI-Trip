from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any


def as_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {}


def as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    return []


def as_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def unique_texts(values: list[Any], limit: int = 6) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for item in values:
        text = as_text(item)
        if not text or text in seen:
            continue
        seen.add(text)
        output.append(text)
        if len(output) >= limit:
            break
    return output


def question_for_field(field: str) -> str:
    mapping = {
        "origin_city": "你从哪座城市出发？",
        "destination": "这次最想去哪个城市或区域？",
        "days": "计划玩几天？",
        "budget_level": "预算更偏省钱、适中还是体验优先？",
        "start_date": "准备哪天出发？",
        "pace": "希望轻松慢游还是紧凑高效？",
    }
    return mapping.get(field, "再补充一点信息，我就可以继续。")


def options_for_field(field: str) -> list[str]:
    if field == "days":
        return ["2天", "3天", "4天"]
    if field == "destination":
        return ["北京", "上海", "成都"]
    if field == "start_date":
        return [(date.today() + timedelta(days=7)).isoformat(), (date.today() + timedelta(days=14)).isoformat()]
    if field == "budget_level":
        return ["低预算", "中预算", "高体验"]
    if field == "pace":
        return ["轻松", "紧凑"]
    return []


def compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def strip_fences(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z0-9_-]*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned)
    return cleaned.strip()


def extract_json_blob(text: str) -> Any:
    cleaned = strip_fences(text)
    if not cleaned:
        return {}
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    for start_char, end_char in (("{", "}"), ("[", "]")):
        start = cleaned.find(start_char)
        end = cleaned.rfind(end_char)
        if start >= 0 and end > start:
            candidate = cleaned[start : end + 1]
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                continue
    return {}


def _parse_env_line(line: str) -> tuple[str, str] | None:
    trimmed = line.strip()
    if not trimmed or trimmed.startswith("#"):
        return None
    if trimmed.startswith("export "):
        trimmed = trimmed[len("export ") :].strip()
    if "=" not in trimmed:
        return None
    key, value = trimmed.split("=", 1)
    key = key.strip()
    value = value.strip()
    if not key:
        return None
    if len(value) >= 2 and ((value[0] == '"' and value[-1] == '"') or (value[0] == "'" and value[-1] == "'")):
        value = value[1:-1]
    return key, value


def load_env_files() -> None:
    cwd = Path.cwd().resolve()
    candidates: list[Path] = []
    for base in [cwd, *cwd.parents[:3]]:
        candidates.append(base / ".env")
        candidates.append(base / ".env.local")

    seen: set[Path] = set()
    for path in candidates:
        if path in seen or not path.is_file():
            continue
        seen.add(path)
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            parsed = _parse_env_line(raw_line)
            if not parsed:
                continue
            key, value = parsed
            if os.getenv(key):
                continue
            os.environ[key] = value


@dataclass
class ServiceConfig:
    service_key: str
    model_base_url: str
    model_api_key: str
    brief_model: str
    chat_model: str
    explain_model: str
    timeout_seconds: float

    @classmethod
    def from_env(cls) -> "ServiceConfig":
        timeout_seconds = float(os.getenv("AI_MODEL_TIMEOUT_SECONDS", "20"))
        return cls(
            service_key=as_text(os.getenv("AI_SERVICE_API_KEY") or os.getenv("AI_SERVICE_INTERNAL_TOKEN")),
            model_base_url=as_text(os.getenv("BAILIAN_BASE_URL") or os.getenv("ALI_BAILIAN_BASE_URL") or "https://dashscope.aliyuncs.com/compatible-mode/v1"),
            model_api_key=as_text(os.getenv("BAILIAN_API_KEY") or os.getenv("DASHSCOPE_API_KEY") or os.getenv("ALI_BAILIAN_API_KEY")),
            brief_model=as_text(os.getenv("BAILIAN_BRIEF_MODEL") or os.getenv("AI_BRIEF_MODEL") or os.getenv("BAILIAN_MODEL") or "qwen-plus"),
            chat_model=as_text(os.getenv("BAILIAN_CHAT_MODEL") or os.getenv("AI_CHAT_MODEL") or os.getenv("BAILIAN_MODEL") or "qwen-plus"),
            explain_model=as_text(os.getenv("BAILIAN_EXPLAIN_MODEL") or os.getenv("AI_EXPLAIN_MODEL") or os.getenv("BAILIAN_MODEL") or "qwen-plus"),
            timeout_seconds=timeout_seconds if timeout_seconds > 0 else 20.0,
        )


class BailianCompatibleClient:
    def __init__(self, config: ServiceConfig) -> None:
        self._config = config

    @property
    def enabled(self) -> bool:
        return bool(self._config.model_api_key and self._config.model_base_url)

    def chat_json(self, model: str, system_prompt: str, user_prompt: str) -> dict[str, Any]:
        if not self.enabled:
            raise RuntimeError("model_api_key is not configured")

        endpoint = self._config.model_base_url.rstrip("/") + "/chat/completions"
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
            "max_tokens": 1400,
        }
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self._config.model_api_key}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self._config.timeout_seconds) as response:
                body = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"llm_http_error:{exc.code}:{detail}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"llm_network_error:{exc.reason}") from exc

        choices = as_list(body.get("choices"))
        if not choices:
            raise RuntimeError("llm_empty_choices")
        message = as_dict(choices[0]).get("message")
        content = as_dict(message).get("content")
        if isinstance(content, list):
            text = "".join(as_text(as_dict(item).get("text") or as_dict(item).get("content")) for item in content)
        else:
            text = as_text(content)
        parsed = extract_json_blob(text)
        if not isinstance(parsed, dict):
            raise RuntimeError("llm_invalid_json")
        return parsed


class TripAIService:
    def __init__(self, config: ServiceConfig) -> None:
        self.config = config
        self.client = BailianCompatibleClient(config)

    def health(self) -> dict[str, Any]:
        return {
            "status": "ok",
            "service": "trip-ai-service",
            "provider": "bailian_compatible" if self.client.enabled else "fallback_rules",
        }

    def enhance_brief(self, payload: dict[str, Any]) -> dict[str, Any]:
        fallback = as_dict(payload.get("fallback_response"))
        response = self._fallback_brief_enhancement(fallback)
        if not self.client.enabled:
            return response

        user_prompt = (
            "你会拿到一个已经由事实层和规则层整理过的 planning brief。"
            "你的职责只有三件事：\n"
            "1. 用更自然的中文给出 assistant_message。\n"
            "2. 在 free_text 明确出现时，补充 soft constraints / must_go / avoid / travel_style_suggestions。\n"
            "3. 如果 brief 还不完整，只围绕第一个 missing field 生成 clarification_question 和 suggested_options。\n\n"
            "禁止事项：\n"
            "- 不要编造目的地、日期、天数、价格、营业时间、路线时长。\n"
            "- 不要新增正式 POI。\n"
            "- next_action 必须和 fallback_response.next_action 一致，除非 fallback 为空。\n\n"
            "返回 JSON 对象，字段必须只包含："
            "assistant_message,next_action,clarification_question,suggested_options,constraints,must_go_additions,avoid_additions,travel_style_suggestions,source_mode。\n\n"
            f"payload={compact_json(payload)}"
        )
        system_prompt = "你是 AI Trip 的模型后置协作层，只能增强解释和澄清，不能改写事实层。输出必须是 JSON。"
        try:
            parsed = self.client.chat_json(self.config.brief_model, system_prompt, user_prompt)
        except RuntimeError:
            return response
        return self._sanitize_brief_response(parsed, fallback, response)

    def enhance_chat(self, payload: dict[str, Any]) -> dict[str, Any]:
        fallback = as_dict(payload.get("fallback_response"))
        response = self._fallback_chat_enhancement(fallback)
        if not self.client.enabled:
            return response

        user_prompt = (
            "你会收到一个已经由规则层生成好的 chat intake 响应。"
            "请把 assistant_message 改写成更自然、简洁的中文，并保留 next_action。"
            "如果 fallback_response.ready_to_generate=false，只能追问第一个 missing field；不要新增别的问题。"
            "不要编造 draft 字段，不要修改 updated_draft，不要承诺外部真实数据已确认。\n\n"
            "返回 JSON 对象，字段只能包含：assistant_message,suggested_options,next_action,confidence,source_mode。\n\n"
            f"payload={compact_json(payload)}"
        )
        system_prompt = "你是 AI Trip 的对话润色层，只能润色提问与说明，不能改动事实字段。输出必须是 JSON。"
        try:
            parsed = self.client.chat_json(self.config.chat_model, system_prompt, user_prompt)
        except RuntimeError:
            return response
        return self._sanitize_chat_response(parsed, fallback, response)

    def explain_itinerary(self, payload: dict[str, Any]) -> dict[str, Any]:
        itinerary = as_dict(payload.get("itinerary"))
        response = self._fallback_itinerary_explain(itinerary)
        if not self.client.enabled:
            return response

        allowed_block_ids = self._collect_block_ids(itinerary)
        allowed_pois = self._collect_pois(itinerary)
        user_prompt = (
            "你会收到一个已经由规则层和事实层生成好的 itinerary。"
            "你的任务是为移动端生成更顺滑的 explain 文案，但绝不能引入新的事实。\n\n"
            "强约束：\n"
            "- 不要新增 itinerary 里不存在的 POI 名称。\n"
            "- 不要编造营业时间、票价、交通时长、天气事实。\n"
            "- block_explanations 只能针对已存在的 block_id。\n"
            "- recommend_reason 只允许解释“为什么这样排”，不要声明未验证事实。\n\n"
            "返回 JSON 对象，字段只能包含：day_summaries,today_hint,block_explanations,source_mode。\n"
            "day_summaries 中每项字段：day_index,date,title,preview,poi_count,transit_minutes,recommended_mode。\n"
            "today_hint 字段：day_index,date,title,next_poi。\n"
            "block_explanations 中每项字段：day_index,block_id,recommend_reason。\n\n"
            f"allowed_block_ids={compact_json(allowed_block_ids)}\n"
            f"allowed_pois={compact_json(allowed_pois)}\n"
            f"payload={compact_json(payload)}"
        )
        system_prompt = "你是 AI Trip 的 explain 生成层，只能解释已有 itinerary，不允许新增地点或外部事实。输出必须是 JSON。"
        try:
            parsed = self.client.chat_json(self.config.explain_model, system_prompt, user_prompt)
        except RuntimeError:
            return response
        return self._sanitize_itinerary_response(parsed, itinerary, response)

    def _fallback_brief_enhancement(self, fallback: dict[str, Any]) -> dict[str, Any]:
        planning_brief = as_dict(fallback.get("planning_brief"))
        missing_fields = unique_texts(as_list(planning_brief.get("missing_fields")))
        first_missing = missing_fields[0] if missing_fields else ""
        return {
            "assistant_message": as_text(fallback.get("assistant_message")) or "我已经整理好当前信息了。",
            "next_action": as_text(fallback.get("next_action")) or ("GENERATE" if planning_brief.get("ready_to_generate") else "COMPLETE_FORM"),
            "clarification_question": question_for_field(first_missing) if first_missing else "",
            "suggested_options": options_for_field(first_missing),
            "constraints": as_dict(planning_brief.get("constraints")),
            "must_go_additions": [],
            "avoid_additions": [],
            "travel_style_suggestions": [],
            "source_mode": "rules_fallback",
        }

    def _sanitize_brief_response(self, parsed: dict[str, Any], fallback: dict[str, Any], base: dict[str, Any]) -> dict[str, Any]:
        constraints = as_dict(parsed.get("constraints"))
        result = {
            "assistant_message": as_text(parsed.get("assistant_message")) or as_text(base.get("assistant_message")),
            "next_action": as_text(parsed.get("next_action")) or as_text(fallback.get("next_action")) or as_text(base.get("next_action")),
            "clarification_question": as_text(parsed.get("clarification_question")) or as_text(base.get("clarification_question")),
            "suggested_options": unique_texts(as_list(parsed.get("suggested_options")) or as_list(base.get("suggested_options"))),
            "constraints": {
                "weather_preference": as_text(constraints.get("weather_preference")),
                "dining_preference": as_text(constraints.get("dining_preference")),
                "lodging_anchor": as_text(constraints.get("lodging_anchor"))[:32],
            },
            "must_go_additions": unique_texts(as_list(parsed.get("must_go_additions")), limit=4),
            "avoid_additions": unique_texts(as_list(parsed.get("avoid_additions")), limit=4),
            "travel_style_suggestions": unique_texts(as_list(parsed.get("travel_style_suggestions")), limit=4),
            "source_mode": as_text(parsed.get("source_mode")) or "llm_bailian",
        }
        return result

    def _fallback_chat_enhancement(self, fallback: dict[str, Any]) -> dict[str, Any]:
        return {
            "assistant_message": as_text(fallback.get("assistant_message")) or "收到，我继续帮你整理。",
            "suggested_options": unique_texts(as_list(fallback.get("suggested_options"))),
            "next_action": as_text(fallback.get("next_action")),
            "confidence": float(fallback.get("confidence") or 0.0),
            "source_mode": "rules_fallback",
        }

    def _sanitize_chat_response(self, parsed: dict[str, Any], fallback: dict[str, Any], base: dict[str, Any]) -> dict[str, Any]:
        confidence = parsed.get("confidence")
        try:
            confidence_value = float(confidence)
        except (TypeError, ValueError):
            confidence_value = float(base.get("confidence") or fallback.get("confidence") or 0.0)

        return {
            "assistant_message": as_text(parsed.get("assistant_message")) or as_text(base.get("assistant_message")),
            "suggested_options": unique_texts(as_list(parsed.get("suggested_options")) or as_list(base.get("suggested_options"))),
            "next_action": as_text(parsed.get("next_action")) or as_text(fallback.get("next_action")) or as_text(base.get("next_action")),
            "confidence": max(0.0, min(confidence_value, 1.0)),
            "source_mode": as_text(parsed.get("source_mode")) or "llm_bailian",
        }

    def _fallback_itinerary_explain(self, itinerary: dict[str, Any]) -> dict[str, Any]:
        day_summaries: list[dict[str, Any]] = []
        block_explanations: list[dict[str, Any]] = []

        for day_index, day_item in enumerate(as_list(itinerary.get("days"))):
            day = as_dict(day_item)
            blocks = [as_dict(item) for item in as_list(day.get("blocks"))]
            pois = [as_text(block.get("poi")) for block in blocks if as_text(block.get("poi"))]
            transit_minutes = 0
            for leg_item in as_list(itinerary.get("transit_legs")):
                leg = as_dict(leg_item)
                if int(leg.get("day_index") or 0) == int(day.get("day_index") or day_index):
                    transit_minutes += int(leg.get("minutes") or 0)

            day_summaries.append(
                {
                    "day_index": int(day.get("day_index") or day_index),
                    "date": as_text(day.get("date")),
                    "title": f"第{int(day.get('day_index') or day_index) + 1}天 {'与'.join(pois[:2])}" if pois else f"第{day_index + 1}天 行程",
                    "preview": " → ".join(pois[:4]),
                    "poi_count": len(pois),
                    "transit_minutes": transit_minutes,
                    "recommended_mode": "all",
                }
            )

            for block in blocks:
                block_id = as_text(block.get("block_id"))
                if not block_id:
                    continue
                block_explanations.append(
                    {
                        "day_index": int(day.get("day_index") or day_index),
                        "block_id": block_id,
                        "recommend_reason": as_text(block.get("recommend_reason")) or "这站延续当前动线安排，方便按顺序推进。",
                    }
                )

        today_hint = {}
        if day_summaries:
            first_day = day_summaries[0]
            next_poi = ""
            if as_list(itinerary.get("days")):
                first_blocks = as_list(as_dict(as_list(itinerary.get("days"))[0]).get("blocks"))
                if first_blocks:
                    next_poi = as_text(as_dict(first_blocks[0]).get("poi"))
            today_hint = {
                "day_index": first_day["day_index"],
                "date": first_day["date"],
                "title": first_day["title"],
                "next_poi": next_poi,
            }

        return {
            "day_summaries": day_summaries,
            "today_hint": today_hint,
            "block_explanations": block_explanations,
            "source_mode": "rules_fallback",
        }

    def _sanitize_itinerary_response(self, parsed: dict[str, Any], itinerary: dict[str, Any], base: dict[str, Any]) -> dict[str, Any]:
        fallback = self._fallback_itinerary_explain(itinerary)
        valid_block_ids = set(self._collect_block_ids(itinerary))

        day_summaries = []
        for item in as_list(parsed.get("day_summaries")):
            summary = as_dict(item)
            if not summary:
                continue
            day_summaries.append(
                {
                    "day_index": int(summary.get("day_index") or 0),
                    "date": as_text(summary.get("date")),
                    "title": as_text(summary.get("title"))[:36],
                    "preview": as_text(summary.get("preview"))[:96],
                    "poi_count": int(summary.get("poi_count") or 0),
                    "transit_minutes": int(summary.get("transit_minutes") or 0),
                    "recommended_mode": as_text(summary.get("recommended_mode")) or "all",
                }
            )

        block_explanations = []
        for item in as_list(parsed.get("block_explanations")):
            block = as_dict(item)
            block_id = as_text(block.get("block_id"))
            if not block_id or block_id not in valid_block_ids:
                continue
            reason = as_text(block.get("recommend_reason"))[:120]
            if not reason:
                continue
            block_explanations.append(
                {
                    "day_index": int(block.get("day_index") or 0),
                    "block_id": block_id,
                    "recommend_reason": reason,
                }
            )

        today_hint_raw = as_dict(parsed.get("today_hint"))
        today_hint = {
            "day_index": int(today_hint_raw.get("day_index") or 0),
            "date": as_text(today_hint_raw.get("date")),
            "title": as_text(today_hint_raw.get("title"))[:36],
            "next_poi": as_text(today_hint_raw.get("next_poi"))[:24],
        }
        if not today_hint["title"]:
            today_hint = as_dict(fallback.get("today_hint"))

        return {
            "day_summaries": day_summaries or as_list(base.get("day_summaries")) or as_list(fallback.get("day_summaries")),
            "today_hint": today_hint or as_dict(base.get("today_hint")) or as_dict(fallback.get("today_hint")),
            "block_explanations": block_explanations or as_list(base.get("block_explanations")) or as_list(fallback.get("block_explanations")),
            "source_mode": as_text(parsed.get("source_mode")) or "llm_bailian",
        }

    def _collect_block_ids(self, itinerary: dict[str, Any]) -> list[str]:
        block_ids: list[str] = []
        for day_item in as_list(itinerary.get("days")):
            day = as_dict(day_item)
            for block_item in as_list(day.get("blocks")):
                block_id = as_text(as_dict(block_item).get("block_id"))
                if block_id:
                    block_ids.append(block_id)
        return unique_texts(block_ids, limit=200)

    def _collect_pois(self, itinerary: dict[str, Any]) -> list[str]:
        pois: list[str] = []
        for day_item in as_list(itinerary.get("days")):
            day = as_dict(day_item)
            for block_item in as_list(day.get("blocks")):
                poi = as_text(as_dict(block_item).get("poi"))
                if poi:
                    pois.append(poi)
        return unique_texts(pois, limit=200)
