from dataclasses import dataclass
from enum import StrEnum


class PlanId(StrEnum):
    LITE = "lite"
    PRO = "pro"
    ULTRA = "ultra"


class Feature(StrEnum):
    CUSTOM_PROMPTS = "custom_prompts"
    SIMULTANEOUS_CAPTURES = "simultaneous_captures"
    SIMULTANEOUS_ANALYSIS = "simultaneous_analysis"
    KEYBOARD_SHORTCUTS = "keyboard_shortcuts"
    INVISIBLE_MODE = "invisible_mode"
    GHOST_MODE = "ghost_mode"


class Quota(StrEnum):
    TRANSCRIPTION_SECONDS = "transcription_seconds"
    SCREEN_CAPTURES = "screen_captures"
    SCREEN_ANALYSES = "screen_analyses"


@dataclass(frozen=True)
class PlanDefinition:
    id: PlanId
    name: str
    price_usd: float
    features: frozenset[Feature]
    quotas: dict[Quota, int]


PLANS: dict[PlanId, PlanDefinition] = {
    PlanId.LITE: PlanDefinition(
        id=PlanId.LITE,
        name="Lite",
        price_usd=4.99,
        features=frozenset(),
        quotas={
            Quota.TRANSCRIPTION_SECONDS: 20 * 60,
            Quota.SCREEN_CAPTURES: 2,
            Quota.SCREEN_ANALYSES: 2,
        },
    ),
    PlanId.PRO: PlanDefinition(
        id=PlanId.PRO,
        name="Pro",
        price_usd=19.99,
        features=frozenset({
            Feature.CUSTOM_PROMPTS,
            Feature.SIMULTANEOUS_CAPTURES,
            Feature.SIMULTANEOUS_ANALYSIS,
            Feature.KEYBOARD_SHORTCUTS,
        }),
        quotas={
            Quota.TRANSCRIPTION_SECONDS: 2 * 3600,
            Quota.SCREEN_CAPTURES: 8,
            Quota.SCREEN_ANALYSES: 8,
        },
    ),
    PlanId.ULTRA: PlanDefinition(
        id=PlanId.ULTRA,
        name="Ultra",
        price_usd=59.99,
        features=frozenset({
            Feature.CUSTOM_PROMPTS,
            Feature.SIMULTANEOUS_CAPTURES,
            Feature.SIMULTANEOUS_ANALYSIS,
            Feature.KEYBOARD_SHORTCUTS,
            Feature.INVISIBLE_MODE,
            Feature.GHOST_MODE,
        }),
        quotas={
            Quota.TRANSCRIPTION_SECONDS: 8 * 3600,
            Quota.SCREEN_CAPTURES: 40,
            Quota.SCREEN_ANALYSES: 40,
        },
    ),
}


def get_plan(plan_id: PlanId) -> PlanDefinition:
    return PLANS[plan_id]


def has_feature(plan_id: PlanId, feature: Feature) -> bool:
    return feature in PLANS[plan_id].features


def get_quota_limit(plan_id: PlanId, quota: Quota) -> int:
    return PLANS[plan_id].quotas[quota]
