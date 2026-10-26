import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import Mock
from urllib.parse import parse_qs, urlparse

from fastapi import HTTPException
from backend.app.oidc import create_login_state
from backend.app.routers import auth
from backend.app.schemas import ChangePasswordRequest


class UnifiedPasswordTests(unittest.TestCase):
    def test_password_action_keeps_pkce_and_normal_login_has_no_action(self):
        query = parse_qs(urlparse(create_login_state(change_password=True)['authorization_url']).query)
        self.assertEqual(query['kc_action'], ['UPDATE_PASSWORD'])
        self.assertEqual(query['code_challenge_method'], ['S256'])
        self.assertTrue(query['state'][0])
        self.assertNotIn('kc_action', parse_qs(urlparse(create_login_state()['authorization_url']).query))
        response = asyncio.run(auth.oidc_change_password())
        self.assertEqual(response.status_code, 303)
        self.assertIn('edusimu_oidc_verifier=', str(response.raw_headers))

    def test_old_local_form_cannot_modify_shadow_password(self):
        user = SimpleNamespace(password_hash='oidc-only')
        db = Mock()
        with self.assertRaises(HTTPException) as raised:
            asyncio.run(auth.change_password(ChangePasswordRequest(current_password='old-password', new_password='new-password-123'), user, db))
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(user.password_hash, 'oidc-only')
        db.commit.assert_not_called()
