import os
import asyncio
import logging
import aiohttp
from backend.tiers import Feature, Quota, PlanId, has_feature, get_quota_limit, PLANS

CONVEX_URL = os.environ.get("VITE_CONVEX_URL", "https://placeholder.convex.cloud")
CONVEX_BACKEND_KEY = os.environ.get("CONVEX_BACKEND_KEY", "")
CONVEX_SITE_URL = CONVEX_URL.replace(".cloud", ".site")

logger = logging.getLogger(__name__)


class FeatureBlockedError(Exception):
    def __init__(self, feature: Feature, plan_id: PlanId):
        self.feature = feature
        self.plan_id = plan_id
        super().__init__(f"Feature '{feature}' not available in plan '{plan_id}'")


class QuotaExceededError(Exception):
    def __init__(self, quota: Quota, plan_id: PlanId, used: int, limit: int):
        self.quota = quota
        self.plan_id = plan_id
        self.used = used
        self.limit = limit
        super().__init__(f"Quota '{quota}' exceeded: {used}/{limit} in plan '{plan_id}'")


class PlanGate:
    def __init__(self, plan_id: PlanId, usage: dict[Quota, int] | None = None, clerk_id: str | None = None):
        self.plan_id = plan_id
        self.clerk_id = clerk_id
        self._usage: dict[Quota, int] = usage or {q: 0 for q in Quota}
        self._unflushed_usage: dict[Quota, int] = {q: 0 for q in Quota}

    async def flush_to_convex(self):
        if not self.clerk_id or not CONVEX_BACKEND_KEY:
            logger.debug("Skipping Convex flush: no clerk_id or backend key")
            return

        quota_type_map = {
            Quota.TRANSCRIPTION_SECONDS: "transcription",
            Quota.SCREEN_CAPTURES: "capture",
            Quota.SCREEN_ANALYSES: "analysis",
        }

        url = f"{CONVEX_SITE_URL}/api/quotas/decrement"
        headers = {
            "Authorization": f"Bearer {CONVEX_BACKEND_KEY}",
            "Content-Type": "application/json",
        }

        for quota, amount in self._unflushed_usage.items():
            if amount > 0:
                q_type = quota_type_map.get(quota)
                if not q_type:
                    continue
                try:
                    async with aiohttp.ClientSession() as session:
                        payload = {
                            "clerkId": self.clerk_id,
                            "quotaType": q_type,
                            "amount": amount,
                        }
                        async with session.post(url, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                            if resp.status == 200:
                                self._unflushed_usage[quota] = 0
                            else:
                                body = await resp.text()
                                logger.error(f"Failed to flush quota to Convex: {resp.status} {body}")
                except Exception as e:
                    logger.error(f"Failed to flush quota to Convex: {e}")

    def require_feature(self, feature: Feature) -> None:
        if not has_feature(self.plan_id, feature):
            raise FeatureBlockedError(feature, self.plan_id)

    def can_use_feature(self, feature: Feature) -> bool:
        return has_feature(self.plan_id, feature)

    def consume_quota(self, quota: Quota, amount: int = 1) -> int:
        limit = get_quota_limit(self.plan_id, quota)
        current = self._usage.get(quota, 0)
        if current + amount > limit:
            raise QuotaExceededError(quota, self.plan_id, current, limit)
        self._usage[quota] = current + amount
        self._unflushed_usage[quota] = self._unflushed_usage.get(quota, 0) + amount
        return limit - (current + amount)

    def get_remaining(self, quota: Quota) -> int:
        limit = get_quota_limit(self.plan_id, quota)
        return limit - self._usage.get(quota, 0)

    def get_usage_summary(self) -> dict:
        return {
            q.value: {
                "used": self._usage.get(q, 0),
                "limit": get_quota_limit(self.plan_id, q),
                "remaining": self.get_remaining(q),
            }
            for q in Quota
        }

    def get_plan_info(self) -> dict:
        plan = PLANS[self.plan_id]
        return {
            "plan_id": plan.id.value,
            "plan_name": plan.name,
            "features": {f.value: has_feature(self.plan_id, f) for f in Feature},
            "quotas": self.get_usage_summary(),
        }