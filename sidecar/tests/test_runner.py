import unittest
from unittest.mock import patch

from sidecar import runner


class RunnerCallbackTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(
            "os.environ",
            {
                "RADAR_WORKER_URL": "https://radar.example",
                "RADAR_SIDECAR_CALLBACK_KEY": "test-key",
                "RADAR_RUN_ID": "run-test-123",
                "RADAR_MODE": "founder",
                "RADAR_TENANT_ID": "founder",
            },
            clear=False,
        )
        self.env.start()

    def tearDown(self):
        self.env.stop()

    @patch("sidecar.runner._api_request")
    def test_candidate_fetch_failure_still_posts_failed_callback(self, api_request):
        api_request.side_effect = [
            RuntimeError("temporary candidates endpoint failure"),
            {"accepted": True},
        ]

        result = runner.main()

        self.assertEqual(result, 1)
        self.assertEqual(api_request.call_count, 2)
        callback_call = api_request.call_args_list[1]
        payload = callback_call.kwargs["payload"]
        self.assertEqual(callback_call.kwargs["method"], "POST")
        self.assertEqual(payload["status"], "failed")
        self.assertEqual(payload["run_id"], "run-test-123")
        self.assertEqual(payload["candidates_received"], 0)
        self.assertEqual(payload["records"], [])

    @patch("sidecar.runner._api_request")
    def test_invalid_candidates_contract_still_posts_failed_callback(self, api_request):
        api_request.side_effect = [
            {"records": "not-a-list"},
            {"accepted": True},
        ]

        result = runner.main()

        self.assertEqual(result, 1)
        self.assertEqual(api_request.call_count, 2)
        payload = api_request.call_args_list[1].kwargs["payload"]
        self.assertEqual(payload["status"], "failed")
        self.assertIn("invalid records field", payload["error"])


if __name__ == "__main__":
    unittest.main()
