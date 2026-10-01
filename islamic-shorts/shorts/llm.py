"""Script-writing language models.

Providers, tried in this order when SCRIPT_PROVIDER=auto (first one with a key wins,
the next ones are fallbacks if it fails):

  claude       ANTHROPIC_API_KEY      paid, best writing quality
  gemini       GEMINI_API_KEY         free tier (aistudio.google.com)
  groq         GROQ_API_KEY           free tier (console.groq.com)
  cloudflare   CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN   free daily allowance
  pollinations free without an account (rate limited), or POLLINATIONS_API_KEY

You can also skip the API entirely: write the plan in Claude Code (see README) and
run `make_video.py --plan plan.json`.
"""

from __future__ import annotations

import importlib.util
import json
import re
from typing import Callable

import requests

from .config import Settings
from .util import FatalProviderError, RetryableError, log, raise_for_http, retry


class LLMError(RuntimeError):
    pass


def extract_json(text: str) -> dict:
    """Parse a JSON object out of a model reply (tolerates fences and chatter)."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    try:
        data = json.loads(text)
    except ValueError:
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            raise LLMError("reply contained no JSON object")
        chunk = text[start:end + 1]
        chunk = re.sub(r",\s*([}\]])", r"\1", chunk)  # trailing commas
        try:
            data = json.loads(chunk)
        except ValueError as exc:
            raise LLMError(f"could not parse JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise LLMError("reply JSON is not an object")
    return data


class Provider:
    name = "base"
    paid = False

    def __init__(self, settings: Settings):
        self.s = settings

    def available(self) -> bool:
        return False

    def generate_json(self, system: str, user: str, schema: dict) -> dict:
        raise NotImplementedError


class ClaudeProvider(Provider):
    name = "claude"
    paid = True

    def available(self) -> bool:
        if not self.s.key("ANTHROPIC_API_KEY"):
            return False
        if importlib.util.find_spec("anthropic") is None:
            log("ANTHROPIC_API_KEY is set but the 'anthropic' package is missing "
                "(pip install anthropic) - skipping Claude.")
            return False
        return True

    def generate_json(self, system: str, user: str, schema: dict) -> dict:
        import anthropic

        client = anthropic.Anthropic(api_key=self.s.key("ANTHROPIC_API_KEY"),
                                     max_retries=3)
        try:
            # Structured output guarantees valid JSON. The default fallback re-runs
            # a request on Anthropic's recommended model if a safety classifier
            # declines it (religious history can trip classifiers now and then).
            with client.beta.messages.stream(
                model=self.s.anthropic_model,
                max_tokens=48000,
                system=system,
                messages=[{"role": "user", "content": user}],
                output_config={
                    "effort": "high",
                    "format": {"type": "json_schema", "schema": schema},
                },
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            ) as stream:
                message = stream.get_final_message()
        except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as exc:
            raise FatalProviderError(f"Claude: {exc}") from exc
        except anthropic.BadRequestError as exc:
            if "credit" in str(exc).lower() or "billing" in str(exc).lower():
                raise FatalProviderError(f"Claude: {exc}") from exc
            raise LLMError(f"Claude rejected the request: {exc}") from exc
        except anthropic.RateLimitError as exc:
            raise RetryableError(f"Claude rate limited: {exc}") from exc
        except anthropic.APIStatusError as exc:
            if exc.status_code >= 500:
                raise RetryableError(f"Claude server error {exc.status_code}") from exc
            raise LLMError(f"Claude error: {exc}") from exc
        except anthropic.APIConnectionError as exc:
            raise RetryableError(f"Claude connection error: {exc}") from exc

        if message.stop_reason == "refusal":
            raise LLMError("Claude declined this request")
        if message.stop_reason == "max_tokens":
            raise LLMError("Claude reply was cut off (max_tokens)")
        text = "".join(b.text for b in message.content if b.type == "text")
        return extract_json(text)


class GeminiProvider(Provider):
    name = "gemini"
    FALLBACK_MODELS = ["gemini-flash-latest", "gemini-2.5-flash"]

    def available(self) -> bool:
        return bool(self.s.key("GEMINI_API_KEY"))

    def generate_json(self, system: str, user: str, schema: dict) -> dict:
        models = [self.s.gemini_model] + [m for m in self.FALLBACK_MODELS
                                          if m != self.s.gemini_model]
        last: Exception | None = None
        for model in models:
            try:
                return self._call(model, system, user)
            except _ModelNotFound as exc:
                last = exc
                log(f"  Gemini model '{model}' not available, trying the next one")
        raise LLMError(f"No Gemini model worked: {last}")

    def _call(self, model: str, system: str, user: str) -> dict:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        body = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 1.0,
                "maxOutputTokens": 32768,
            },
        }
        resp = requests.post(url, json=body, timeout=300,
                             headers={"x-goog-api-key": self.s.key("GEMINI_API_KEY")})
        if resp.status_code == 404:
            raise _ModelNotFound(resp.text[:200])
        if resp.status_code == 400 and "API key" in resp.text:
            raise FatalProviderError(f"Gemini: invalid API key ({resp.text[:200]})")
        raise_for_http(resp, "Gemini")
        data = resp.json()
        cands = data.get("candidates") or []
        if not cands:
            reason = (data.get("promptFeedback") or {}).get("blockReason", "no candidates")
            raise LLMError(f"Gemini returned nothing ({reason})")
        cand = cands[0]
        parts = (cand.get("content") or {}).get("parts") or []
        text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
        if cand.get("finishReason") == "MAX_TOKENS":
            raise LLMError("Gemini reply was cut off (MAX_TOKENS)")
        return extract_json(text)


class _ModelNotFound(RuntimeError):
    pass


class OpenAICompatibleProvider(Provider):
    """Groq, Cloudflare Workers AI and Pollinations all speak this dialect."""

    base_url = ""
    max_tokens = 16000

    def api_key(self) -> str:
        raise NotImplementedError

    def model(self) -> str:
        raise NotImplementedError

    def chat_url(self) -> str:
        return self.base_url.rstrip("/") + "/chat/completions"

    def headers(self) -> dict:
        return {"Authorization": f"Bearer {self.api_key()}"}

    def generate_json(self, system: str, user: str, schema: dict) -> dict:
        body = {
            "model": self.model(),
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.9,
            "max_tokens": self.max_tokens,
            "response_format": {"type": "json_object"},
        }
        headers = self.headers()
        url = self.chat_url()
        resp = requests.post(url, json=body, headers=headers, timeout=300)
        if resp.status_code == 400 and "response_format" in resp.text:
            body.pop("response_format")
            resp = requests.post(url, json=body, headers=headers, timeout=300)
        raise_for_http(resp, self.name)
        data = resp.json()
        try:
            choice = data["choices"][0]
            content = choice["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError(f"{self.name}: unexpected reply {str(data)[:300]}") from exc
        if choice.get("finish_reason") == "length":
            raise LLMError(f"{self.name}: reply was cut off")
        if isinstance(content, list):  # some servers return content parts
            content = "".join(p.get("text", "") for p in content if isinstance(p, dict))
        return extract_json(content or "")


class GroqProvider(OpenAICompatibleProvider):
    name = "groq"
    base_url = "https://api.groq.com/openai/v1"

    def available(self) -> bool:
        return bool(self.s.key("GROQ_API_KEY"))

    def api_key(self) -> str:
        return self.s.key("GROQ_API_KEY")

    def model(self) -> str:
        return self.s.groq_model


class CloudflareTextProvider(OpenAICompatibleProvider):
    name = "cloudflare"
    max_tokens = 8000

    def available(self) -> bool:
        return bool(self.s.key("CLOUDFLARE_ACCOUNT_ID") and self.s.key("CLOUDFLARE_API_TOKEN"))

    @property
    def base_url(self) -> str:  # type: ignore[override]
        acct = self.s.key("CLOUDFLARE_ACCOUNT_ID")
        return f"https://api.cloudflare.com/client/v4/accounts/{acct}/ai/v1"

    def api_key(self) -> str:
        return self.s.key("CLOUDFLARE_API_TOKEN")

    def model(self) -> str:
        return self.s.cloudflare_text_model


class PollinationsTextProvider(OpenAICompatibleProvider):
    name = "pollinations"
    base_url = "https://gen.pollinations.ai/v1"

    def available(self) -> bool:
        return True   # works without an account (rate limited)

    def api_key(self) -> str:
        return self.s.key("POLLINATIONS_API_KEY")

    def chat_url(self) -> str:
        if self.api_key():
            return super().chat_url()
        return "https://text.pollinations.ai/openai"   # free, no account

    def headers(self) -> dict:
        return super().headers() if self.api_key() else {}

    def model(self) -> str:
        return self.s.pollinations_text_model


PROVIDERS = {
    "claude": ClaudeProvider,
    "gemini": GeminiProvider,
    "groq": GroqProvider,
    "cloudflare": CloudflareTextProvider,
    "pollinations": PollinationsTextProvider,
}
ALIASES = {"anthropic": "claude", "google": "gemini"}


class ScriptLLM:
    def __init__(self, settings: Settings):
        choice = ALIASES.get(settings.script_provider, settings.script_provider)
        order = list(PROVIDERS)
        if choice != "auto":
            if choice not in PROVIDERS:
                raise SystemExit(f"Unknown SCRIPT_PROVIDER '{choice}'. "
                                 f"Use one of: auto, {', '.join(PROVIDERS)}")
            order.remove(choice)
            order.insert(0, choice)
        if settings.free_only:
            order = [n for n in order if not PROVIDERS[n].paid]
        self.providers = [p for p in (PROVIDERS[n](settings) for n in order) if p.available()]

    @property
    def ready(self) -> bool:
        return bool(self.providers)

    def describe(self) -> str:
        return " -> ".join(p.name for p in self.providers) or "none"

    def generate_json(self, system: str, user: str, schema: dict,
                      validate: Callable[[dict], None] | None = None,
                      what: str = "script") -> dict:
        if not self.providers:
            raise LLMError(
                "No script-writing service is configured. Add a free GEMINI_API_KEY "
                "to .env (see README), or pass your own --script / --plan file.")
        errors = []
        for provider in list(self.providers):
            for attempt in range(2):
                try:
                    data = retry(lambda: provider.generate_json(system, user, schema),
                                 what=f"{provider.name} {what}")
                    if validate:
                        validate(data)
                    return data
                except FatalProviderError as exc:
                    log(f"  {provider.name} unavailable: {exc}")
                    self.providers.remove(provider)
                    errors.append(str(exc))
                    break
                except (LLMError, ValueError, KeyError, TypeError, RetryableError,
                        requests.RequestException) as exc:
                    errors.append(f"{provider.name}: {exc}")
                    log(f"  {provider.name} {what} attempt {attempt + 1} failed: {exc}")
        raise LLMError("All script services failed:\n  " + "\n  ".join(errors[-6:]))
