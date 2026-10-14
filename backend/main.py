from __future__ import annotations

import io
import math
import os
from collections import Counter, deque
from typing import Any

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse


app = FastAPI(title="Wafer Defect Analysis API", version="1.0.0")


def _cors_origins() -> list[str]:
    configured = os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )
    return [origin.strip().rstrip("/") for origin in configured.split(",") if origin.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REQUIRED_COLUMNS = {"wafer_id", "die_x", "die_y", "status"}
ALLOWED_STATUS = {"PASS", "FAIL", "INACTIVE"}


def _normalize_status(value: Any) -> str:
    text = str(value).strip().upper()
    aliases = {"GOOD": "PASS", "OK": "PASS", "P": "PASS", "F": "FAIL", "BAD": "FAIL", "N/A": "INACTIVE", "NA": "INACTIVE"}
    return aliases.get(text, text)


def _make_demo_frame() -> pd.DataFrame:
    rng = np.random.default_rng(19)
    rows: list[dict[str, Any]] = []
    wafer_specs = [
        ("WFR-0421", "edge", 0.13),
        ("WFR-0422", "center", 0.10),
        ("WFR-0423", "scratch", 0.07),
        ("WFR-0424", "clean", 0.025),
    ]
    for wafer_id, pattern, noise in wafer_specs:
        for x in range(-18, 19):
            for y in range(-18, 19):
                radius = math.sqrt(x * x + y * y) / 18
                if radius > 1.02:
                    continue
                if radius > 0.92 and rng.random() < 0.34:
                    status = "INACTIVE"
                else:
                    status = "FAIL" if rng.random() < noise else "PASS"
                    if pattern == "edge" and radius > 0.76 and rng.random() < 0.64:
                        status = "FAIL"
                    if pattern == "center" and radius < 0.34 and rng.random() < 0.72:
                        status = "FAIL"
                    if pattern == "scratch" and abs(y - 0.65 * x - 1.5) < 1.0 and rng.random() < 0.85:
                        status = "FAIL"
                rows.append({"wafer_id": wafer_id, "die_x": x, "die_y": y, "status": status, "bin": 1 if status == "PASS" else (7 if status == "FAIL" else 0)})
    return pd.DataFrame(rows)


def _validate_frame(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    missing = REQUIRED_COLUMNS - set(frame.columns)
    if missing:
        raise HTTPException(status_code=422, detail={"message": "Missing required columns", "missing_columns": sorted(missing), "expected_schema": schema_payload()})

    wafer_ids = frame["wafer_id"].fillna("").astype(str).str.strip()
    blank_id_rows = wafer_ids.eq("") | wafer_ids.str.lower().eq("nan")
    if blank_id_rows.any():
        raise HTTPException(status_code=422, detail={"message": "wafer_id must not be blank", "row_count": int(blank_id_rows.sum())})
    frame["wafer_id"] = wafer_ids
    frame["status"] = frame["status"].map(_normalize_status)
    for coordinate in ("die_x", "die_y"):
        numeric = pd.to_numeric(frame[coordinate], errors="coerce")
        if numeric.isna().any():
            raise HTTPException(status_code=422, detail={"message": "Coordinates must be numeric", "column": coordinate, "row_count": int(numeric.isna().sum())})
        non_integer = ~np.isclose(numeric, np.round(numeric))
        if non_integer.any():
            raise HTTPException(status_code=422, detail={"message": "Coordinates must be integers", "column": coordinate, "row_count": int(non_integer.sum())})
        frame[coordinate] = numeric.astype(int)

    duplicate_rows = frame.duplicated(subset=["wafer_id", "die_x", "die_y"], keep=False)
    if duplicate_rows.any():
        examples = frame.loc[duplicate_rows, ["wafer_id", "die_x", "die_y"]].head(10).to_dict(orient="records")
        raise HTTPException(status_code=422, detail={"message": "Duplicate die coordinates found within a wafer", "row_count": int(duplicate_rows.sum()), "examples": examples})

    invalid_status = sorted(set(frame["status"]) - ALLOWED_STATUS)
    if invalid_status:
        raise HTTPException(status_code=422, detail={"message": "Unsupported status value", "values": invalid_status, "allowed": sorted(ALLOWED_STATUS)})
    if frame.empty:
        raise HTTPException(status_code=422, detail="CSV contains no usable die rows")
    if len(frame) > 500_000:
        frame = frame.head(500_000)
    return frame


def schema_payload() -> list[dict[str, str]]:
    return [
        {"field": "wafer_id", "type": "string", "required": "yes", "description": "Wafer identifier, e.g. WFR-0421"},
        {"field": "die_x", "type": "integer", "required": "yes", "description": "Die column coordinate, centered around 0"},
        {"field": "die_y", "type": "integer", "required": "yes", "description": "Die row coordinate, centered around 0"},
        {"field": "status", "type": "PASS | FAIL | INACTIVE", "required": "yes", "description": "Electrical test result"},
        {"field": "bin", "type": "integer", "required": "no", "description": "Optional hard bin code"},
    ]


def _zones(frame: pd.DataFrame) -> list[dict[str, Any]]:
    active = frame[frame.status != "INACTIVE"].copy()
    if active.empty:
        return []
    cx, cy = active.die_x.mean(), active.die_y.mean()
    max_r = max(np.sqrt((active.die_x - cx) ** 2 + (active.die_y - cy) ** 2).max(), 1)
    radius = np.sqrt((active.die_x - cx) ** 2 + (active.die_y - cy) ** 2) / max_r
    active["zone"] = pd.cut(radius, [-0.01, 0.34, 0.68, 1.01], labels=["Core", "Mid", "Edge"])
    grouped = active.groupby("zone", observed=False).agg(total=("status", "size"), fails=("status", lambda x: int((x == "FAIL").sum())))
    return [{"zone": str(index), "total": int(row.total), "fails": int(row.fails), "fail_rate": round(row.fails / row.total * 100, 1) if row.total else 0} for index, row in grouped.iterrows()]


def _connected_components(fails: set[tuple[int, int]]) -> list[int]:
    remaining = set(fails)
    sizes: list[int] = []
    while remaining:
        root = remaining.pop()
        queue = deque([root])
        size = 1
        while queue:
            x, y = queue.popleft()
            for neighbor in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if neighbor in remaining:
                    remaining.remove(neighbor)
                    queue.append(neighbor)
                    size += 1
        sizes.append(size)
    return sorted(sizes, reverse=True)


def _patterns(frame: pd.DataFrame) -> list[dict[str, Any]]:
    active = frame[frame.status != "INACTIVE"]
    fail = active[active.status == "FAIL"]
    if active.empty or fail.empty:
        return [{"name": "No defect signature", "score": 0, "evidence": "No failing dies in the active population.", "source": "RULE ENGINE"}]
    cx, cy = active.die_x.mean(), active.die_y.mean()
    max_r = max(np.sqrt((active.die_x - cx) ** 2 + (active.die_y - cy) ** 2).max(), 1)
    fail_radius = np.sqrt((fail.die_x - cx) ** 2 + (fail.die_y - cy) ** 2) / max_r
    edge_share = float((fail_radius > 0.76).mean())
    center_share = float((fail_radius < 0.34).mean())
    points = fail[["die_x", "die_y"]].to_numpy()
    scratch_score = 0.0
    if len(points) >= 5:
        cov = np.cov(points.T)
        vals = np.linalg.eigvalsh(cov)
        scratch_score = float(vals[-1] / max(vals[0], 0.01))
    components = _connected_components({(int(x), int(y)) for x, y in points})
    cluster_share = (components[0] / len(points)) if components else 0
    candidates = [
        {"name": "Edge ring", "score": min(99, round(edge_share * 100)), "evidence": f"{round(edge_share * 100)}% of failing dies sit beyond the 0.76 radial boundary."},
        {"name": "Center cluster", "score": min(99, round(center_share * 100)), "evidence": f"{round(center_share * 100)}% of failing dies are concentrated in the core zone."},
        {"name": "Scratch / line", "score": min(99, round(min(scratch_score / 10, 0.99) * 100)), "evidence": "Principal-axis concentration suggests a line-shaped spatial signature."},
        {"name": "Localized cluster", "score": min(99, round(cluster_share * 100)), "evidence": f"Largest connected fail region contains {components[0] if components else 0} dies."},
    ]
    candidates.sort(key=lambda item: item["score"], reverse=True)
    for candidate in candidates:
        candidate["source"] = "RULE ENGINE"
    return candidates[:3]


def analyze_frame(frame: pd.DataFrame, source_name: str = "demo") -> dict[str, Any]:
    frame = _validate_frame(frame)
    wafers = []
    for wafer_id, wafer_frame in frame.groupby("wafer_id", sort=False):
        active = wafer_frame[wafer_frame.status != "INACTIVE"]
        fail = active[active.status == "FAIL"]
        passed = active[active.status == "PASS"]
        total = len(active)
        kpis = {
            "total_die": int(total),
            "pass_die": int(len(passed)),
            "fail_die": int(len(fail)),
            "inactive_die": int(len(wafer_frame) - total),
            "yield": round(len(passed) / total * 100, 1) if total else 0,
            "fail_rate": round(len(fail) / total * 100, 1) if total else 0,
        }
        dies = []
        for row in wafer_frame.itertuples(index=False):
            dies.append({"x": int(row.die_x), "y": int(row.die_y), "status": row.status, "bin": int(getattr(row, "bin", 0) or 0)})
        status_counts = [{"status": status.title(), "count": int((wafer_frame.status == status).sum())} for status in ["PASS", "FAIL", "INACTIVE"]]
        wafers.append({
            "wafer_id": str(wafer_id),
            "kpis": kpis,
            "dies": dies,
            "patterns": _patterns(wafer_frame),
            "zones": _zones(wafer_frame),
            "status_counts": status_counts,
        })
    selected = wafers[0]
    return {
        "source": source_name,
        "current_wafer_id": selected["wafer_id"],
        "wafers": wafers,
        "schema": schema_payload(),
        "pattern_engine": {"name": "Rule-based spatial heuristics", "status": "active", "ai_status": "AI model not connected", "ai_ready": True},
        **selected,
    }


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "wafer-defect-analysis-api"}


@app.get("/api/demo")
def demo() -> dict[str, Any]:
    return analyze_frame(_make_demo_frame(), "Demo / generated sample")


@app.get("/api/demo/csv")
def demo_csv() -> StreamingResponse:
    output = io.StringIO()
    _make_demo_frame().to_csv(output, index=False)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=wafer_demo.csv"})


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...), wafer_id: str | None = Query(default=None)) -> dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=415, detail="Only CSV files are supported in this first release")
    raw = await file.read()
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File exceeds the 20 MB upload limit")
    try:
        frame = pd.read_csv(io.BytesIO(raw))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not parse CSV: {exc}") from exc
    result = analyze_frame(frame, file.filename)
    if wafer_id:
        matching = next((item for item in result["wafers"] if item["wafer_id"] == wafer_id), None)
        if matching:
            result.update(matching)
            result["current_wafer_id"] = wafer_id
    return result
