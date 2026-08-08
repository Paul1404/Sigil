from types import SimpleNamespace
import unittest
from unittest.mock import patch

from sqlalchemy import Text

from imap_fetcher import fetch_mailbox
from models import MailboxEmail


class MailboxEmailSchemaTests(unittest.TestCase):
    def test_email_headers_are_not_limited_to_512_characters(self):
        table = MailboxEmail.__table__

        for column_name in ("message_id", "from_address", "to_address"):
            with self.subTest(column_name=column_name):
                self.assertIsInstance(table.c[column_name].type, Text)


class _ExpiringMailbox:
    id = 1
    encrypted_password = "encrypted"
    imap_host = "imap.example.com"
    imap_port = 993
    username = "reports@example.com"
    folder = "INBOX"

    def __init__(self):
        self.expired = False

    @property
    def name(self):
        if self.expired:
            raise RuntimeError("mailbox attributes are unavailable before rollback")
        return "Reports"


class _FakeImap:
    def __init__(self, *_args):
        pass

    def login(self, *_args):
        return "OK", []

    def select(self, *_args, **_kwargs):
        return "OK", []

    def search(self, *_args):
        return "OK", [b"1"]

    def fetch(self, *_args):
        raw_email = (
            b"Message-ID: <message@example.com>\r\n"
            b"From: sender@example.com\r\n"
            b"To: recipient@example.com\r\n"
            b"Subject: Not a report\r\n"
            b"Content-Type: text/plain; charset=utf-8\r\n"
            b"\r\n"
            b"Hello"
        )
        return "OK", [(b"1 (RFC822)", raw_email)]

    def store(self, *_args):
        return "OK", []

    def close(self):
        return "OK", []

    def logout(self):
        return "BYE", []


class _FakeSession:
    def __init__(self, mailbox):
        self.mailbox = mailbox
        self.rolled_back = False

    async def execute(self, _query):
        return SimpleNamespace(scalar_one_or_none=lambda: None)

    def add(self, _item):
        pass

    async def commit(self):
        self.mailbox.expired = True
        raise RuntimeError("database commit failed")

    async def rollback(self):
        self.rolled_back = True


class MailboxFetchErrorTests(unittest.IsolatedAsyncioTestCase):
    async def test_commit_failure_rolls_back_without_reloading_mailbox(self):
        mailbox = _ExpiringMailbox()
        session = _FakeSession(mailbox)

        with (
            patch("imap_fetcher.decrypt_password", return_value="password"),
            patch("imap_fetcher.imaplib.IMAP4_SSL", _FakeImap),
            patch("imap_fetcher.logger.error") as log_error,
        ):
            result = await fetch_mailbox(mailbox, session)

        self.assertTrue(session.rolled_back)
        self.assertEqual("error", result["status"])
        self.assertIn("database commit failed", result["message"])
        log_error.assert_called_once()


if __name__ == "__main__":
    unittest.main()
