import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from main import health


class HealthTests(unittest.IsolatedAsyncioTestCase):
    async def test_readiness_checks_database(self):
        connection = AsyncMock()
        context = MagicMock()
        context.__aenter__ = AsyncMock(return_value=connection)
        context.__aexit__ = AsyncMock(return_value=False)
        with patch("main.engine.connect", return_value=context):
            response = await health()
        connection.execute.assert_awaited_once()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "no-store")

    async def test_failed_database_is_unavailable_without_details(self):
        with patch("main.engine.connect", side_effect=RuntimeError("private URL")):
            response = await health()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.body, b'{"status":"unavailable"}')
        self.assertEqual(response.headers["cache-control"], "no-store")
