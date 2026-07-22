import os
import unittest
from unittest.mock import patch

from app.email_service import (
    EmailConfigError,
    _load_config,
    smtp_profile_for_access_scope,
)


class EmailProfileTests(unittest.TestCase):
    def test_finaugevents_profile_uses_dedicated_account(self):
        environment = {
            "SMTP_HOST": "smtp.ust.hk",
            "SMTP_PORT": "587",
            "SMTP_USERFINAUGEVENTS": "finaugevents",
            "SMTP_PASSWORDFINAUGEVENTS": "fina-secret",
            "SMTP_FROMFINAUGEVENTS": "FINA <finaugevents@ust.hk>",
        }
        with patch.dict(os.environ, environment, clear=True):
            self.assertEqual(
                _load_config("finaugevents"),
                (
                    "smtp.ust.hk",
                    587,
                    "finaugevents",
                    "fina-secret",
                    "FINA <finaugevents@ust.hk>",
                ),
            )

    def test_yfc_profile_uses_dedicated_account(self):
        environment = {
            "SMTP_HOST": "smtp.ust.hk",
            "SMTP_PORT": "587",
            "SMTP_USERYFC": "yfc",
            "SMTP_PASSWORDYFC": "yfc-secret",
            "SMTP_FROMYFC": "YFC <yfc@ust.hk>",
        }
        with patch.dict(os.environ, environment, clear=True):
            self.assertEqual(
                _load_config("yfc"),
                (
                    "smtp.ust.hk",
                    587,
                    "yfc",
                    "yfc-secret",
                    "YFC <yfc@ust.hk>",
                ),
            )

    def test_unconfigured_profile_falls_back_to_legacy_smtp(self):
        environment = {
            "SMTP_HOST": "smtp.gmail.com",
            "SMTP_PORT": "587",
            "SMTP_USER": "legacy@example.com",
            "SMTP_PASSWORD": "legacy-secret",
            "SMTP_FROM": "Legacy <legacy@example.com>",
        }
        with patch.dict(os.environ, environment, clear=True):
            self.assertEqual(
                _load_config("yfc"),
                (
                    "smtp.gmail.com",
                    587,
                    "legacy@example.com",
                    "legacy-secret",
                    "Legacy <legacy@example.com>",
                ),
            )

    def test_missing_profile_and_legacy_password_is_an_error(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(EmailConfigError):
                _load_config("yfc")

    def test_access_scopes_choose_the_expected_profile(self):
        self.assertEqual(smtp_profile_for_access_scope("portal"), "finaugevents")
        self.assertEqual(smtp_profile_for_access_scope("trading"), "yfc")
        self.assertEqual(smtp_profile_for_access_scope("trading_player"), "yfc")
        self.assertEqual(smtp_profile_for_access_scope("trading_gamemaster"), "yfc")


if __name__ == "__main__":
    unittest.main()
