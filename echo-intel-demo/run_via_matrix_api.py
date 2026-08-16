#!/usr/bin/env python3
"""回声智能 AgentTeams 跑通脚本：通过 Matrix HTTP API 绕过 Element Web。

流程：
1. 登录 admin 获取 access_token
2. sync 找 manager 房间（包含 manager Agent 的房间）
3. join manager 房间，发送完整创建请求
4. 轮询 sync 等 manager 回复（创建结果摘要）
5. 从回复提取 Team 房间 ID 和 team_leader_name
6. join Team 房间，逐条发 10 条测试需求
7. 每条等 offer-verification 报告后发下一条
8. 汇总 feasible，统计可执行方案率
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

import urllib.request
import urllib.error

BASE = "http://127.0.0.1:18080"
DEMO_DIR = Path("/Users/qichenxie/WorkBuddy/AI Infra黑客松/echo-intel-demo")
USER = "admin"
PASS = "adminfa8e0c7e7858"


def http(method, path, token=None, body=None, timeout=20):
    url = f"{BASE}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8") or "{}")


def login():
    code, body = http("POST", "/_matrix/client/v3/login", body={
        "type": "m.login.password",
        "identifier": {"type": "m.id.user", "user": USER},
        "password": PASS,
    })
    assert code == 200, f"登录失败 {code} {body}"
    return body["access_token"]


def sync(token, since=None, timeout_ms=5000):
    qs = f"timeout={timeout_ms}"
    if since:
        qs += f"&since={since}"
    code, body = http("GET", f"/_matrix/client/v3/sync?{qs}", token=token, timeout=30)
    if code != 200:
        return since, {}
    return body.get("next_batch", since), body


def send_message(token, room_id, text, txn_id=None):
    if txn_id is None:
        txn_id = f"m{int(time.time()*1000)}"
    code, body = http(
        "PUT",
        f"/_matrix/client/v3/rooms/{room_id}/send/m.room.message/{txn_id}",
        token=token,
        body={"msgtype": "m.text", "body": text},
    )
    if code != 200:
        print(f"[!] 发消息失败 {code} {body}", file=sys.stderr)
    return code == 200


def join_room(token, room_id):
    code, _ = http("POST", f"/_matrix/client/v3/rooms/{room_id}/join", token=token,
                    body={"reason": "running demo"})
    return code == 200


def find_rooms(sync_body):
    join = sync_body.get("rooms", {}).get("join", {})
    return list(join.keys())


def get_room_name(token, room_id):
    # 通过 sync 拿 state 事件
    code, body = http("GET", f"/_matrix/client/v3/rooms/{room_id}/state", token=token)
    if code != 200:
        return None
    for ev in body:
        if ev.get("type") == "m.room.name":
            return ev.get("name", "")
    return ""


def latest_message_in_room(token, room_id, limit=20):
    code, body = http("GET", f"/_matrix/client/v3/rooms/{room_id}/messages?limit={limit}&dir=b", token=token)
    if code != 200:
        return []
    out = []
    for chunk in body.get("chunk", []):
        if chunk.get("type") == "m.room.message":
            out.append({
                "sender": chunk.get("sender", ""),
                "body": chunk.get("content", {}).get("body", ""),
                "ts": chunk.get("origin_server_ts", 0),
            })
    return out


def wait_for_new_message(token, room_id, since_ts, timeout=120):
    """轮询 sync 等 room 里出现 ts > since_ts 的新消息。返回新消息列表。"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        next_batch, body = sync(token, timeout_ms=3000)
        # 检查 join 房间里的新事件
        join = body.get("rooms", {}).get("join", {})
        evs = join.get(room_id, {}).get("timeline", {}).get("events", [])
        new_msgs = []
        for ev in evs:
            if ev.get("type") == "m.room.message" and ev.get("origin_server_ts", 0) > since_ts:
                sender = ev.get("sender", "")
                body_text = ev.get("content", {}).get("body", "")
                new_msgs.append({"sender": sender, "body": body_text, "ts": ev.get("origin_server_ts")})
        if new_msgs:
            return next_batch, new_msgs
        time.sleep(1)
    return next_batch, []


def main():
    print("=== 1. 登录 ===")
    token = login()
    print(f"  ✓ 登录成功，token 前缀 {token[:8]}...")

    print("\n=== 2. 同步找 manager 房间 ===")
    since, body = sync(token, timeout_ms=3000)
    rooms = find_rooms(body)
    print(f"  已 join 的房间: {len(rooms)} 个")
    # 找名称含 manager 的房间，或者和 manager Agent 聊天的房间
    manager_room = None
    for rid in rooms:
        name = get_room_name(token, rid) or ""
        # manager 通常会主动打招呼
        msgs = latest_message_in_room(token, rid, limit=5)
        if any("manager" in (m.get("sender", "") + name).lower() or "你好" in m.get("body", "") or "Manager" in m.get("body", "") or "worker" in m.get("body", "").lower() for m in msgs):
            manager_room = rid
            print(f"  ✓ 找到 manager 房间: {rid} (name={name})")
            break
    if not manager_room:
        # fallback: 第一个 join 房间（admin 自己创建的 DM）
        manager_room = rooms[0]
        print(f"  fallback 用第一个房间: {manager_room}")

    # 获取 manager 房间最新消息的时间戳，作为后续 wait 的基线
    msgs_before = latest_message_in_room(token, manager_room, limit=1)
    base_ts = msgs_before[0]["ts"] if msgs_before else int(time.time() * 1000) - 60000
    print(f"  基线 ts: {base_ts}")

    print("\n=== 3. 发送创建请求到 manager ===")
    create_msg = (DEMO_DIR / "at" / "create_agents_messages.ready.md").read_text(encoding="utf-8")
    # 找到 "## 复制到 Manager 的完整创建请求" 之后的那个 ```text ... ``` 块
    idx = create_msg.find("## 复制到 Manager 的完整创建请求")
    if idx > 0:
        segment = create_msg[idx:]
        m = re.search(r"```text\n(.*?)```", segment, re.DOTALL)
        if m:
            body_text = m.group(1)
        else:
            body_text = segment
    else:
        body_text = create_msg
    print(f"  准备发送 {len(body_text)} 字符...")
    if not send_message(token, manager_room, body_text):
        print("  ✗ 发送失败")
        return
    print("  ✓ 已发送")

    print("\n=== 4. 等待 manager 回复创建结果 ===")
    print("  （manager 创建 4 Worker + Team 需要几分钟，耐心等待）")
    since, new_msgs = wait_for_new_message(token, manager_room, base_ts, timeout=600)
    print(f"  收到 {len(new_msgs)} 条新消息")
    manager_reply = "\n".join(m["body"] for m in new_msgs)
    print(f"  --- manager 回复摘要（前 800 字）---\n{manager_reply[:800]}\n  ---")

    # 提取 Team 房间名 + team_leader_name
    # manager 回复里通常会包含：
    #   Team 房间名称：以 Team 开头
    #   team_leader_name：customer-journey-leader
    team_room_id = None
    team_leader = "customer-journey-leader"
    for line in manager_reply.split("\n"):
        if "Team" in line and ("房间" in line or "room" in line.lower()):
            print(f"  Team 房间信息行: {line.strip()}")
        if "customer-journey-leader" in line.lower() or "team_leader_name" in line.lower():
            print(f"  leader 行: {line.strip()}")
    # 重新同步一次获取最新房间列表（Team 房间是新建的）
    print("\n=== 5. 同步最新房间列表找 Team 房间 ===")
    since, body = sync(token, since=since, timeout_ms=3000)
    rooms = find_rooms(body)
    print(f"  当前 join 的房间: {len(rooms)} 个")
    for rid in rooms:
        name = get_room_name(token, rid) or ""
        print(f"    {rid}  name={name}")
        if name.lower().startswith("team") and "echo" in name.lower():
            team_room_id = rid
            print(f"  ✓ 找到 Team 房间: {team_room_id}")

    if not team_room_id:
        print("  ✗ 未找到 Team 房间，请检查 manager 回复")
        print("  manager 完整回复：")
        print(manager_reply)
        return

    print(f"\n=== 6. 在 Team 房间逐条发 10 条测试需求 ===")
    test_file = DEMO_DIR / "at" / "test_offer_rate_message.md"
    test_text = test_file.read_text(encoding="utf-8")

    # 提取 10 条 ```text ... ``` 块
    demands = re.findall(r"## 需求 (\d+).*?\n\n```text\n(.*?)```", test_text, re.DOTALL)
    print(f"  提取到 {len(demands)} 条测试需求")

    results = []
    for n, body_text in demands:
        # 替换 @<team_leader_name> → @customer-journey-leader
        body_text = body_text.replace("@<team_leader_name>", "@customer-journey-leader")
        # 提取 scenario_id
        sid_match = re.search(r"scenario_id:\s*(\S+)", body_text)
        sid = sid_match.group(1) if sid_match else f"req_{n}"
        print(f"\n  [{sid}] 发送测试需求...")
        # 取该房间最新消息 ts
        msgs_before = latest_message_in_room(token, team_room_id, limit=1)
        base_ts = msgs_before[0]["ts"] if msgs_before else int(time.time() * 1000) - 5000
        if not send_message(token, team_room_id, body_text):
            print(f"  ✗ 发送失败")
            continue
        # 等报告
        since, new_msgs = wait_for_new_message(token, team_room_id, base_ts, timeout=300)
        report = "\n".join(m["body"] for m in new_msgs)
        feasible = None
        for line in report.split("\n"):
            if "feasible" in line.lower() or "可执行" in line:
                # 抓可行/不可行关键词
                if re.search(r"feasible[:\s]*true", line.lower()) or "可行" in line:
                    feasible = True
                elif re.search(r"feasible[:\s]*false", line.lower()) or "不可行" in line:
                    feasible = False
        # 也尝试匹配 feasible_rate
        rate_match = re.search(r"feasible_rate[:\s]*([0-9.]+)", report)
        rate = float(rate_match.group(1)) if rate_match else None
        # feasible_count / total_count
        count_match = re.search(r"feasible_count[:\s]*(\d+).*total_count[:\s]*(\d+)", report, re.DOTALL)
        fc, tc = (int(count_match.group(1)), int(count_match.group(2))) if count_match else (None, None)
        print(f"  [{sid}] 报告（{len(report)} 字）: feasible={feasible} feasible_count={fc}/{tc} rate={rate}")
        results.append({"sid": sid, "feasible": feasible, "feasible_count": fc, "total_count": tc, "rate": rate})

    print("\n=== 7. 汇总 ===")
    feasible_n = sum(1 for r in results if r["feasible"] is True)
    infeasible_n = sum(1 for r in results if r["feasible"] is False)
    unknown_n = len(results) - feasible_n - infeasible_n
    print(f"  明确可行: {feasible_n}")
    print(f"  明确不可行: {infeasible_n}")
    print(f"  未知/解析失败: {unknown_n}")
    print(f"  总测试需求: {len(results)}")
    if (feasible_n + infeasible_n) > 0:
        rate = feasible_n / (feasible_n + infeasible_n)
        print(f"  可执行方案率: {rate:.0%}")
    print("\n  详细结果：")
    for r in results:
        print(f"    {r['sid']}: feasible={r['feasible']} feasible_count={r['feasible_count']}/{r['total_count']} rate={r['rate']}")


if __name__ == "__main__":
    main()