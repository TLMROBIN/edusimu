import asyncio
import unittest
from unittest.mock import patch

from starlette.datastructures import Headers, URL

from backend.app.routers import auth


class FakeRequest:
    def __init__(self, path="/api/auth/oidc/callback", headers=None):
        self.cookies = {
            "edusimu_oidc_state": "state-123",
            "edusimu_oidc_verifier": "verifier-123",
        }
        self.headers = Headers(headers or {})
        self.url = URL(f"http://testserver{path}")


class OidcCallbackSubpathTests(unittest.TestCase):
    def test_oidc_callback_redirects_to_edusimu_home_under_forwarded_prefix(self):
        request = FakeRequest(headers={"x-forwarded-prefix": "/edusimu"})

        with patch("backend.app.routers.auth.exchange_code_for_claims", return_value={"preferred_username": "student"}), patch(
            "backend.app.routers.auth.issue_local_token_for_claims", return_value="local-token"
        ):
            response = asyncio.run(auth.oidc_callback(code="code-123", state="state-123", request=request, db=object()))

        html = response.body.decode("utf-8")
        self.assertIn('localStorage.setItem("token", "local-token");', html)
        self.assertIn('location.replace("/edusimu/home");', html)
        self.assertNotIn('location.replace("/home");', html)


if __name__ == "__main__":
    unittest.main()
