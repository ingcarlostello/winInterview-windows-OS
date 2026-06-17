import logging
import os
from typing import Any

import aiohttp

from backend.tiers import PlanId, Quota

logger = logging.getLogger(__name__)


def _resolve_convex_site_url() -> str:
    convex_url = os.environ.get("VITE_CONVEX_URL", "")
    return convex_url.replace(".cloud", ".site")


class ConvexClient:
    """Client for calling Convex HTTP actions from the Python backend."""

    def __init__(self, site_url: str | None = None, backend_key: str | None = None) -> None:
        self.site_url = site_url or _resolve_convex_site_url()
        self.backend_key = backend_key or os.environ.get("CONVEX_BACKEND_KEY", "")

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.backend_key}",
            "Content-Type": "application/json",
        }

    async def get_user_and_quota(
        self, clerk_id: str
    ) -> tuple[PlanId, dict[Quota, int]] | None:
        """Fetch the user's plan and current quota remaining from Convex."""
        if not self.site_url or not self.backend_key:
            logger.warning("Convex site URL or backend key not configured")
            return None

        url = f"{self.site_url}/api/users/get"
        payload = {"clerkId": clerk_id}
        timeout = aiohttp.ClientTimeout(total=5)

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url, json=payload, headers=self._headers(), timeout=timeout
                ) as response:
                    if response.status != 200:
                        body = await response.text()
                        logger.error(
                            "Failed to fetch user quota from Convex: %s %s",
                            response.status,
                            body,
                        )
                        return None

                    data: dict[str, Any] = await response.json()
        except Exception as e:
            logger.error("Error fetching user quota from Convex: %s", e)
            return None

        plan_id_str = data.get("planId", "lite")
        try:
            plan_id = PlanId(plan_id_str)
        except ValueError:
            plan_id = PlanId.LITE

        quota_data = data.get("quota") or {}
        remaining = {
            Quota.TRANSCRIPTION_SECONDS: int(
                quota_data.get("transcriptionSecondsRemaining", 0)
            ),
            Quota.SCREEN_CAPTURES: int(quota_data.get("capturesRemaining", 0)),
            Quota.SCREEN_ANALYSES: int(quota_data.get("analysesRemaining", 0)),
        }

        return plan_id, remaining

    async def decrement_quota(
        self, clerk_id: str, quota_type: str, amount: int
    ) -> bool:
        """Decrement a quota for the given user via Convex HTTP action."""
        if not self.site_url or not self.backend_key:
            logger.warning("Convex site URL or backend key not configured")
            return False

        url = f"{self.site_url}/api/quotas/decrement"
        payload = {
            "clerkId": clerk_id,
            "quotaType": quota_type,
            "amount": amount,
        }
        timeout = aiohttp.ClientTimeout(total=5)

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url, json=payload, headers=self._headers(), timeout=timeout
                ) as response:
                    if response.status == 200:
                        return True

                    body = await response.text()
                    logger.error(
                        "Failed to decrement quota in Convex: %s %s",
                        response.status,
                        body,
                    )
                    return False
        except Exception as e:
            logger.error("Error decrementing quota in Convex: %s", e)
            return False
