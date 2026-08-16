from __future__ import annotations

import json
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCENARIO_DIR = PROJECT_ROOT / "scenarios"


# ------------- 简化写类状态（Mock 内存态，非持久化）-------------
HOLD_LOCK = threading.Lock()
ACTIVE_HOLDS: Dict[str, Dict[str, Any]] = {}
HOLD_INDEX: Dict[str, str] = {}
HOLD_IDEMPOTENCY: Dict[str, str] = {}
HOLD_BY_OFFER: Dict[str, str] = {}

ORDERS: Dict[str, Dict[str, Any]] = {}
ORDER_IDEMPOTENCY: Dict[str, str] = {}

FAILED_CASES: List[Dict[str, Any]] = [
    {
        "case_id": "FC-001",
        "loop": "闭环2",
        "reason": "并发锁超时未补偿",
        "evidence": "并发 hold 同一资源未阻断",
    }
]
IMPROVEMENT_PROPOSALS: Dict[str, Dict[str, Any]] = {}
IMPROVEMENT_BY_IDEMPOTENCY: Dict[str, str] = {}


def load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def list_scenarios() -> List[str]:
    return sorted(path.stem for path in SCENARIO_DIR.glob("*.json"))


def load_scenario(scenario_id: str) -> Dict[str, Any]:
    path = SCENARIO_DIR / f"{scenario_id}.json"
    if not path.exists():
        available = ", ".join(list_scenarios())
        raise ValueError(f"Unknown scenario '{scenario_id}'. Available: {available}")
    return load_json(path)


def compact(value: Any, max_len: int = 180) -> str:
    text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    return text if len(text) <= max_len else text[: max_len - 3] + "..."


def _resource_key(payload: Optional[Dict[str, Any]]) -> str:
    payload = payload or {}
    tw = payload.get("time_window") or {}
    device_id = payload.get("device_id", "") or payload.get("resource_id", "") or ""
    start = tw.get("start", "") if isinstance(tw, dict) else ""
    end = tw.get("end", "") if isinstance(tw, dict) else ""
    return f"{device_id}|{start}|{end}"


def _invalid_request_error(name: str, missing: List[str]) -> Dict[str, Any]:
    return {"ok": False, "tool": name, "reason": "invalid_request", "missing_fields": missing}


def _require_confirmation(name: str, confirmation_token: str) -> Optional[Dict[str, Any]]:
    if not confirmation_token:
        return {"ok": False, "tool": name, "reason": "confirmation_token_required"}
    return None


class LocalMockTools:
    """回声智能售前闭环（闭环 1/2/3/4）Mock 工具。"""

    def __init__(self, scenario_id: str) -> None:
        self.scenario_id = scenario_id
        self.scenario = load_scenario(scenario_id)
        self.trace: List[Dict[str, Any]] = []

    def _record(self, tool: str, args: Dict[str, Any], result: Any) -> Any:
        self.trace.append(
            {
                "time": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                "tool": tool,
                "args": args,
                "result_preview": compact(result),
            }
        )
        return result

    # ---- search_catalog（商品/目录，L0 只读）----

    def list_devices(self) -> List[Dict[str, Any]]:
        return self._record("search_catalog.list_devices", {}, self.scenario.get("devices", []))

    def list_professionals(self) -> List[Dict[str, Any]]:
        return self._record("search_catalog.list_professionals", {}, self.scenario.get("professionals", []))

    def check_credentials(self, professional_id: Optional[str] = None) -> Dict[str, Any]:
        pro = next(
            (p for p in self.scenario.get("professionals", []) if p.get("id") == professional_id),
            None,
        )
        if pro is None:
            return self._record(
                "search_catalog.check_credentials",
                {"professional_id": professional_id},
                {"professional_id": professional_id, "credential_ok": False, "reason": "professional not found"},
            )
        return self._record(
            "search_catalog.check_credentials",
            {"professional_id": professional_id},
            {
                "professional_id": professional_id,
                "credentials": pro.get("credentials", []),
                "credential_ok": bool(pro.get("credential_ok")),
            },
        )

    # ---- check_availability（库存/档期，L0 只读）----

    def check_stock(self, device_id: Optional[str] = None) -> Dict[str, Any]:
        dev = next((d for d in self.scenario.get("devices", []) if d.get("id") == device_id), None)
        if dev is None:
            return self._record(
                "check_availability.check_stock",
                {"device_id": device_id},
                {"device_id": device_id, "in_stock": False, "reason": "device not found"},
            )
        return self._record(
            "check_availability.check_stock",
            {"device_id": device_id},
            {"device_id": device_id, "in_stock": bool(dev.get("in_stock"))},
        )

    def check_availability(self, time_window: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        avail = self.scenario.get("availability", {})
        return self._record(
            "check_availability.check_availability",
            {"time_window": time_window},
            {"available": bool(avail.get("available")), "window": avail.get("window", "")},
        )

    # ---- calculate_quote（报价，L0 只读）----

    def get_price(self, device_id: Optional[str] = None, professional_id: Optional[str] = None) -> Dict[str, Any]:
        quote = self.scenario.get("quote", {})
        return self._record(
            "calculate_quote.get_price",
            {"device_id": device_id, "professional_id": professional_id},
            {
                "device_id": device_id,
                "professional_id": professional_id,
                "daily_rate": quote.get("daily_rate"),
                "currency": quote.get("currency", "CNY"),
                "valid": bool(quote.get("valid")),
            },
        )

    # ---- 闭环2/3 写类工具（contracts operationId）----

    def hold_inventory(
        self,
        tenant_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        offer_id: Optional[str] = None,
        state_version: Optional[int] = None,
        confirmation_token: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        missing: List[str] = []
        if tenant_id is None:
            missing.append("tenant_id")
        if conversation_id is None:
            missing.append("conversation_id")
        if offer_id is None:
            missing.append("offer_id")
        if state_version is None:
            missing.append("state_version")
        if idempotency_key is None:
            missing.append("idempotency_key")
        if missing:
            return self._record("hold_inventory", {}, _invalid_request_error("hold_inventory", missing))

        denied = _require_confirmation("hold_inventory", confirmation_token or "")
        if denied:
            return self._record("hold_inventory", {
                "tenant_id": tenant_id,
                "offer_id": offer_id,
                "idempotency_key": idempotency_key,
            }, denied)

        idempotency_lock_key = f"{tenant_id}:{conversation_id}:{offer_id}:{idempotency_key}"
        cached_id = HOLD_IDEMPOTENCY.get(idempotency_lock_key)
        if cached_id and cached_id in ACTIVE_HOLDS:
            return self._record("hold_inventory", {
                "tenant_id": tenant_id,
                "offer_id": offer_id,
                "idempotency_key": idempotency_key,
            }, ACTIVE_HOLDS[cached_id])

        resource_key = _resource_key(payload or {})
        with HOLD_LOCK:
            existing_hold_id = HOLD_INDEX.get(resource_key)
            existing = ACTIVE_HOLDS.get(existing_hold_id, {}) if existing_hold_id else {}
            if existing.get("state") == "held":
                if existing.get("idempotency_key") == idempotency_key:
                    return self._record("hold_inventory", {
                        "tenant_id": tenant_id,
                        "offer_id": offer_id,
                        "idempotency_key": idempotency_key,
                    }, existing)
                return self._record("hold_inventory", {
                    "tenant_id": tenant_id,
                    "offer_id": offer_id,
                    "idempotency_key": idempotency_key,
                }, {
                    "ok": False,
                    "reason": "oversell_blocked",
                    "holder": existing.get("hold_id", existing_hold_id),
                })

            hold_id = f"HOLD-{uuid.uuid4().hex[:8]}"
            rec = {
                "ok": True,
                "hold_id": hold_id,
                "tenant_id": tenant_id,
                "conversation_id": conversation_id,
                "offer_id": offer_id,
                "state": "held",
                "resource_key": resource_key,
                "state_version": state_version,
                "idempotency_key": idempotency_key,
                "payload": payload or {},
            }
            ACTIVE_HOLDS[hold_id] = rec
            HOLD_INDEX[resource_key] = hold_id
            HOLD_IDEMPOTENCY[idempotency_lock_key] = hold_id
            if offer_id:
                HOLD_BY_OFFER[offer_id] = hold_id
            return self._record("hold_inventory", {
                "tenant_id": tenant_id,
                "offer_id": offer_id,
                "idempotency_key": idempotency_key,
            }, rec)

    def release_hold(
        self,
        tenant_id: Optional[str] = None,
        hold_id: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        if tenant_id is None:
            return self._record("release_hold", {}, _invalid_request_error("release_hold", ["tenant_id"]))
        if hold_id is None:
            return self._record("release_hold", {"tenant_id": tenant_id}, _invalid_request_error("release_hold", ["hold_id"]))
        if idempotency_key is None:
            return self._record("release_hold", {"tenant_id": tenant_id, "hold_id": hold_id}, _invalid_request_error("release_hold", ["idempotency_key"]))

        rec = ACTIVE_HOLDS.get(hold_id)
        if rec is None:
            return self._record("release_hold", {"tenant_id": tenant_id, "hold_id": hold_id}, {"ok": False, "reason": "hold_not_found"})
        if rec.get("idempotency_key") != idempotency_key:
            return self._record("release_hold", {"tenant_id": tenant_id, "hold_id": hold_id}, {"ok": False, "reason": "idempotency_mismatch"})

        with HOLD_LOCK:
            rec["state"] = "released"
            key = rec.get("resource_key", "")
            if key:
                HOLD_INDEX.pop(key, None)
            return self._record("release_hold", {"tenant_id": tenant_id, "hold_id": hold_id}, {
                "ok": True,
                "state": "released",
                "hold_id": hold_id,
            })

    def create_order_draft(
        self,
        tenant_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        offer_id: Optional[str] = None,
        state_version: Optional[int] = None,
        confirmation_token: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        missing: List[str] = []
        if tenant_id is None:
            missing.append("tenant_id")
        if conversation_id is None:
            missing.append("conversation_id")
        if offer_id is None:
            missing.append("offer_id")
        if state_version is None:
            missing.append("state_version")
        if idempotency_key is None:
            missing.append("idempotency_key")
        if missing:
            return self._record("create_order_draft", {}, _invalid_request_error("create_order_draft", missing))

        denied = _require_confirmation("create_order_draft", confirmation_token or "")
        if denied:
            return self._record("create_order_draft", {
                "tenant_id": tenant_id,
                "offer_id": offer_id,
                "idempotency_key": idempotency_key,
            }, denied)

        key = f"{tenant_id}:{conversation_id}:{offer_id}:{idempotency_key}"
        existing_order_id = ORDER_IDEMPOTENCY.get(key)
        if existing_order_id and existing_order_id in ORDERS:
            return self._record("create_order_draft", {
                "tenant_id": tenant_id,
                "offer_id": offer_id,
                "idempotency_key": idempotency_key,
            }, ORDERS[existing_order_id])

        hold_id = HOLD_BY_OFFER.get(offer_id, "")
        order_id = f"ORD-{uuid.uuid4().hex[:8]}"
        rec = {
            "ok": True,
            "order_id": order_id,
            "status": "pending_payment",
            "tenant_id": tenant_id,
            "conversation_id": conversation_id,
            "offer_id": offer_id,
            "state_version": state_version,
            "hold_id": hold_id,
            "idempotency_key": idempotency_key,
            "holds": [{"resource_id": hold_id or "na", "state": "held" if hold_id else "na"}],
            "compensation": [],
        }
        ORDERS[order_id] = rec
        ORDER_IDEMPOTENCY[key] = order_id
        return self._record("create_order_draft", {
            "tenant_id": tenant_id,
            "offer_id": offer_id,
            "idempotency_key": idempotency_key,
        }, rec)

    def get_order_status(self, tenant_id: Optional[str] = None, order_id: Optional[str] = None) -> Dict[str, Any]:
        if tenant_id is None:
            return self._record("get_order_status", {}, _invalid_request_error("get_order_status", ["tenant_id"]))
        if order_id is None:
            return self._record("get_order_status", {"tenant_id": tenant_id}, _invalid_request_error("get_order_status", ["order_id"]))
        order = ORDERS.get(order_id)
        if order is None:
            return self._record("get_order_status", {"tenant_id": tenant_id, "order_id": order_id}, {
                "ok": False,
                "reason": "order_not_found",
                "tenant_id": tenant_id,
                "order_id": order_id,
            })
        return self._record("get_order_status", {"tenant_id": tenant_id, "order_id": order_id}, order)

    def get_policy(self, tenant_id: Optional[str] = None, merchant_id: Optional[str] = None, query: Optional[str] = None) -> Dict[str, Any]:
        if tenant_id is None:
            return self._record("get_policy", {}, _invalid_request_error("get_policy", ["tenant_id"]))
        policy = self.scenario.get("policy", {})
        if query is None:
            return self._record("get_policy", {"tenant_id": tenant_id}, {
                "tenant_id": tenant_id,
                "merchant_id": merchant_id,
                "query": "",
                "policy": policy,
            })
        if query in policy:
            return self._record("get_policy", {"tenant_id": tenant_id, "merchant_id": merchant_id, "query": query}, {
                "tenant_id": tenant_id,
                "merchant_id": merchant_id,
                "query": query,
                "policy": {query: policy.get(query, {})},
            })
        return self._record("get_policy", {"tenant_id": tenant_id, "merchant_id": merchant_id, "query": query}, {
            "tenant_id": tenant_id,
            "merchant_id": merchant_id,
            "query": query,
            "policy": {"query": query, "result": "not_found"},
        })

    def create_handoff(
        self,
        tenant_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        reason: Optional[str] = None,
        packet: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        missing: List[str] = []
        if tenant_id is None:
            missing.append("tenant_id")
        if conversation_id is None:
            missing.append("conversation_id")
        if reason is None:
            missing.append("reason")
        if packet is None:
            missing.append("packet")
        if missing:
            return self._record("create_handoff", {}, _invalid_request_error("create_handoff", missing))

        handoff_id = f"HO-{uuid.uuid4().hex[:8]}"
        return self._record("create_handoff", {
            "tenant_id": tenant_id,
            "conversation_id": conversation_id,
            "reason": reason,
        }, {
            "ok": True,
            "handoff_id": handoff_id,
            "status": "dispatched",
            "tenant_id": tenant_id,
            "conversation_id": conversation_id,
            "reason": reason,
            "packet": packet,
        })

    # ---- 闭环4 质量/知识工具 ----

    def list_failed_cases(self, tenant_id: Optional[str] = None, since: Optional[str] = None) -> Dict[str, Any]:
        if tenant_id is None:
            return self._record("list_failed_cases", {}, _invalid_request_error("list_failed_cases", ["tenant_id"]))
        return self._record("list_failed_cases", {"tenant_id": tenant_id, "since": since}, {
            "tenant_id": tenant_id,
            "cases": FAILED_CASES,
            "since": since,
        })

    def create_improvement_proposal(
        self,
        tenant_id: Optional[str] = None,
        trace_id: Optional[str] = None,
        diff: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        if tenant_id is None:
            return self._record("create_improvement_proposal", {}, _invalid_request_error("create_improvement_proposal", ["tenant_id"]))
        if trace_id is None:
            return self._record("create_improvement_proposal", {"tenant_id": tenant_id}, _invalid_request_error("create_improvement_proposal", ["trace_id"]))
        if diff is None:
            return self._record("create_improvement_proposal", {"tenant_id": tenant_id, "trace_id": trace_id}, _invalid_request_error("create_improvement_proposal", ["diff"]))

        idem_key = f"{tenant_id}:{trace_id}:{idempotency_key or ''}:{json.dumps(diff, sort_keys=True, ensure_ascii=False)}"
        cached = IMPROVEMENT_BY_IDEMPOTENCY.get(idem_key)
        if cached and cached in IMPROVEMENT_PROPOSALS:
            return self._record("create_improvement_proposal", {"tenant_id": tenant_id, "trace_id": trace_id}, IMPROVEMENT_PROPOSALS[cached])

        proposal_id = f"IP-{uuid.uuid4().hex[:8]}"
        rec = {
            "ok": True,
            "proposal_id": proposal_id,
            "tenant_id": tenant_id,
            "trace_id": trace_id,
            "status": "proposed",
            "diff": diff,
            "idempotency_key": idempotency_key,
            "created_at": time.time(),
        }
        IMPROVEMENT_PROPOSALS[proposal_id] = rec
        IMPROVEMENT_BY_IDEMPOTENCY[idem_key] = proposal_id
        return self._record("create_improvement_proposal", {"tenant_id": tenant_id, "trace_id": trace_id, "idempotency_key": idempotency_key}, rec)

    def run_regression_suite(self, tenant_id: Optional[str] = None, proposal_id: Optional[str] = None, dataset_version: Optional[str] = "v1") -> Dict[str, Any]:
        if tenant_id is None:
            return self._record("run_regression_suite", {}, _invalid_request_error("run_regression_suite", ["tenant_id"]))
        if proposal_id is None:
            return self._record("run_regression_suite", {"tenant_id": tenant_id}, _invalid_request_error("run_regression_suite", ["proposal_id"]))
        if dataset_version is None:
            return self._record("run_regression_suite", {"tenant_id": tenant_id, "proposal_id": proposal_id}, _invalid_request_error("run_regression_suite", ["dataset_version"]))

        proposal = IMPROVEMENT_PROPOSALS.get(proposal_id)
        if proposal is None:
            return self._record("run_regression_suite", {"tenant_id": tenant_id, "proposal_id": proposal_id}, {
                "ok": False,
                "reason": "proposal_not_found",
                "result": "fail",
            })

        return self._record("run_regression_suite", {
            "tenant_id": tenant_id,
            "proposal_id": proposal_id,
            "dataset_version": dataset_version,
        }, {
            "ok": True,
            "tenant_id": tenant_id,
            "proposal_id": proposal_id,
            "dataset_version": dataset_version,
            "result": "pass",
            "coverage": 0.98,
            "proposal": proposal,
        })
