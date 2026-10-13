import unittest

import pandas as pd
from fastapi import HTTPException

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
        with self.assertRaises(HTTPException):
            analyze_frame(pd.DataFrame([{"wafer_id": "W1", "die_x": 0}]), "invalid.csv")

    def test_blank_wafer_id_is_rejected(self) -> None:
        with self.assertRaisesRegex(HTTPException, "wafer_id must not be blank"):
            analyze_frame(pd.DataFrame([{"wafer_id": " ", "die_x": 0, "die_y": 0, "status": "PASS"}]), "blank-id.csv")

    def test_non_integer_coordinates_are_rejected(self) -> None:
        with self.assertRaisesRegex(HTTPException, "Coordinates must be integers"):
            analyze_frame(pd.DataFrame([{"wafer_id": "W1", "die_x": 0.5, "die_y": 0, "status": "PASS"}]), "fractional-coordinate.csv")

    def test_duplicate_coordinates_within_wafer_are_rejected(self) -> None:
        frame = pd.DataFrame([
            {"wafer_id": "W1", "die_x": 0, "die_y": 0, "status": "PASS"},
            {"wafer_id": "W1", "die_x": 0, "die_y": 0, "status": "FAIL"},
        ])
        with self.assertRaisesRegex(HTTPException, "Duplicate die coordinates"):
            analyze_frame(frame, "duplicate-coordinate.csv")

    def test_same_coordinate_across_different_wafers_is_allowed(self) -> None:
        frame = pd.DataFrame([
            {"wafer_id": "W1", "die_x": 0, "die_y": 0, "status": "PASS"},
            {"wafer_id": "W2", "die_x": 0, "die_y": 0, "status": "FAIL"},
        ])
        result = analyze_frame(frame, "multi-wafer.csv")
        self.assertEqual(len(result["wafers"]), 2)


if __name__ == "__main__":
    unittest.main()
