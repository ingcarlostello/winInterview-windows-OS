import jwt
from jwt import PyJWKClient
from typing import Dict, Any
from backend.config import settings

_jwk_client = None

def get_jwk_client() -> PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        url = settings.clerk_jwks_url or "https://infinite-quail-91.clerk.accounts.dev/.well-known/jwks.json"
        _jwk_client = PyJWKClient(url)
    return _jwk_client

def verify_clerk_token(token: str) -> Dict[str, Any]:
    """
    Verifies a Clerk JWT token.
    Raises jwt.PyJWTError if invalid.
    Returns the decoded payload.
    """
    if not token:
        raise ValueError("Token is missing")

    jwk_client = get_jwk_client()
    signing_key = jwk_client.get_signing_key_from_jwt(token)
    
    # Clerk tokens usually have an 'azp' (Authorized Party) indicating the frontend URL,
    # but for simplicity we skip audience validation or configure it properly based on the environment.
    payload = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        options={"verify_aud": False} # Set to True and provide audience if strict validation needed
    )
    
    return payload
