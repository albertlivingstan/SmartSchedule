"""Real-time event streaming broker (Server-Sent Events) for SmartSchedule AI 3.0.
Broadcasts slot bookings, conflicts, and rescheduling updates to connected clients.
"""
import asyncio
import json
from typing import AsyncGenerator, Set
from datetime import datetime, timezone

class RealtimeBroker:
    def __init__(self):
        self._subscribers: Set[asyncio.Queue] = set()

    async def subscribe(self) -> AsyncGenerator[str, None]:
        queue = asyncio.Queue(maxsize=100)
        self._subscribers.add(queue)
        try:
            # Yield initial keep-alive
            yield f": keep-alive\n\n"
            while True:
                msg = await queue.get()
                yield msg
        finally:
            self._subscribers.discard(queue)

    def broadcast(self, event_type: str, data: dict):
        payload = {
            "type": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": data
        }
        msg = f"event: {event_type}\ndata: {json.dumps(payload)}\n\n"
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(msg)
            except (asyncio.QueueFull, Exception):
                pass

realtime_broker = RealtimeBroker()
