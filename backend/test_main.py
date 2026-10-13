import unittest

import pandas as pd

from backend.main import _make_demo_frame, analyze_frame


class AnalysisSmokeTests(unittest.TestCase):
    def test_demo_contains_multiple_wafers_and_kpis(self) -> None:
        result = analyze_frame(_make_demo_frame(), "demo.csv")
        self.assertEqual(len(result["wafers"]), 4)
        self.assertGreater(result["kpis"]["total_die"], 0)
        self.assertIn("patterns", result)
        self.assertIn("zones", result)

    def test_status_aliases_are_normalized(self) -> None:
        frame = pd.DataFrame([
            {"wafer_id": "W1", "die_x": 0, "die_y": 0, "status": "good"},
            {"wafer_id": "W1", "die_x": 1, "die_y": 0, "status": "bad"},
        ])
        result = analyze_frame(frame, "aliases.csv")
        self.assertEqual(result["kpis"]["pass_die"], 1)
        self.assertEqual(result["kpis"]["fail_die"], 1)

    def test_missing_columns_are_rejected(self) -> None:
        with self.assertRaises(Exception):
            analyze_frame(pd.DataFrame([{"wafer_id": "W1", "die_x": 0}]), "invalid.csv")


if __name__ == "__main__":
    unittest.main()
