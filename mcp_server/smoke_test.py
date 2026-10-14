"""Drive the Roamio MCP server as a real client would: spawn it, list tools, call one."""
import asyncio, json, os, sys
from mcp import Client, StdioServerParameters

async def main():
    env = {**os.environ, "OPENAI_API_KEY": os.environ.get("OPENAI_API_KEY", "sk-smoke-dummy")}
    async with Client(StdioServerParameters(command=sys.executable, args=["mcp_server/server.py"], env=env)) as c:
        tools = await c.list_tools()
        print(f"TOOLS ({len(tools.tools)}):")
        for t in tools.tools:
            first = (t.description or "").strip().splitlines()[0]
            print(f"  - {t.name}: {first[:72]}")
        r = await c.call_tool("plan_trip", {
            "destination_ids": ["hunza-valley"], "days": 8,
            "budget_pkr": 400000, "month": 7, "start_city": "Lahore"})
        data = json.loads(r.content[0].text) if r.content else r.structuredContent
        print("\nplan_trip(Hunza, 8d, 400k PKR, July, from Lahore):")
        print("  feasible:", data["feasible"])
        print("  stops:   ", data["route"]["stops"], "|", data["route"]["round_trip_drive_hours"], "h round trip")
        print("  cost:    ", f'{data["cost_pkr"]["total"]:,} PKR', data["cost_pkr"]["breakdown"])
        print("  budget:  ", data["verdict"]["budget"]["status"])
        r2 = await c.call_tool("plan_trip", {
            "destination_ids": ["skardu"], "days": 8, "budget_pkr": 400000, "month": 1})
        d2 = json.loads(r2.content[0].text) if r2.content else r2.structuredContent
        print("\nplan_trip(Skardu in January):")
        print("  feasible:", d2["feasible"], "| problems:", d2["problems"])

asyncio.run(main())
