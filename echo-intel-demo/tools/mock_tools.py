from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCENARIO_DIR = PROJECT_ROOT / "scenarios"


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


class LocalMockTools:
    """回声智能售前闭环（闭环 1）的本地 Mock 工具。

    工具名严格对齐 V2.0 表格 65「MCP/适配器层」组件 + 表格 129「L0 只读」：
      - catalog（商品）: list_devices / list_professionals / check_credentials
      - inventory_schedule（库存/档期）: check_stock / check_availability
      - quote（报价）: get_price
    覆盖表格 81「可执行方案校验」五要素：设备、专业人员、资质、价格、档期。
    """

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

    # ---- catalog（商品，L0 只读）----

    def list_devices(self) -> List[Dict[str, Any]]:
        return self._record("catalog.list_devices", {}, self.scenario.get("devices", []))

    def list_professionals(self) -> List[Dict[str, Any]]:
        return self._record("catalog.list_professionals", {}, self.scenario.get("professionals", []))

    def check_credentials(self, professional_id: Optional[str] = None) -> Dict[str, Any]:
        pro = next(
            (p for p in self.scenario.get("professionals", []) if p.get("id") == professional_id),
            None,
        )
        if pro is None:
            return self._record(
                "catalog.check_credentials",
                {"professional_id": professional_id},
                {"professional_id": professional_id, "credential_ok": False, "reason": "professional not found"},
            )
        return self._record(
            "catalog.check_credentials",
            {"professional_id": professional_id},
            {
                "professional_id": professional_id,
                "credentials": pro.get("credentials", []),
                "credential_ok": bool(pro.get("credential_ok")),
            },
        )

    # ---- inventory_schedule（库存/档期，L0 只读）----

    def check_stock(self, device_id: Optional[str] = None) -> Dict[str, Any]:
        dev = next((d for d in self.scenario.get("devices", []) if d.get("id") == device_id), None)
        if dev is None:
            return self._record(
                "inventory_schedule.check_stock",
                {"device_id": device_id},
                {"device_id": device_id, "in_stock": False, "reason": "device not found"},
            )
        return self._record(
            "inventory_schedule.check_stock",
            {"device_id": device_id},
            {"device_id": device_id, "in_stock": bool(dev.get("in_stock"))},
        )

    def check_availability(self, time_window: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        avail = self.scenario.get("availability", {})
        return self._record(
            "inventory_schedule.check_availability",
            {"time_window": time_window},
            {"available": bool(avail.get("available")), "window": avail.get("window", "")},
        )

    # ---- quote（报价，L0 只读）----

    def get_price(self, device_id: Optional[str] = None, professional_id: Optional[str] = None) -> Dict[str, Any]:
        quote = self.scenario.get("quote", {})
        return self._record(
            "quote.get_price",
            {"device_id": device_id, "professional_id": professional_id},
            {
                "device_id": device_id,
                "professional_id": professional_id,
                "daily_rate": quote.get("daily_rate"),
                "currency": quote.get("currency", "CNY"),
                "valid": bool(quote.get("valid")),
            },
        )
