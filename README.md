# Wafer Defect Analysis Dashboard

반도체 웨이퍼 불량 분석을 위한 로컬 풀스택 대시보드입니다. CSV를 업로드하면 FastAPI가 유효성을 검사하고 pandas/NumPy로 수율, 방사형 구역, 공간 패턴을 계산합니다. 프론트엔드는 React + TypeScript + Tailwind CSS + Plotly로 웨이퍼맵과 분석 결과를 보여줍니다.

## 현재 구현된 기능

- CSV 업로드와 서버 측 형식·값 검증
- PASS / FAIL / INACTIVE die 시각화
- Plotly 확대, 이동, hover die 정보 확인
- 전체 die, 정상 die, 불량 die, 비활성 die, 수율, 불량률 KPI
- 규칙 기반 `Edge ring`, `Center cluster`, `Scratch / line`, `Localized cluster` 후보 분석
- 규칙 엔진 결과와 향후 AI 모델 연결 상태를 UI에서 분리 표시
- 여러 wafer를 하나의 CSV로 업로드하고 비교 테이블에서 wafer 전환
- 분석 통계 CSV 다운로드 및 데모 CSV 다운로드
- API 장애 시에도 화면 확인을 위한 프론트엔드 로컬 fallback 데이터

## CSV 입력 형식

필수 컬럼은 아래 네 가지입니다. 한 파일에 여러 `wafer_id`를 넣을 수 있습니다.

| 컬럼 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `wafer_id` | string | 예 | 웨이퍼 식별자, 예: `WFR-0421` |
| `die_x` | integer / numeric | 예 | 0 중심 die X 좌표 |
| `die_y` | integer / numeric | 예 | 0 중심 die Y 좌표 |
| `status` | `PASS` / `FAIL` / `INACTIVE` | 예 | 전기적 검사 결과 |
| `bin` | integer | 아니오 | 선택 hard-bin 코드 |

`GOOD`, `OK`, `P`는 `PASS`로, `BAD`, `F`는 `FAIL`로 정규화됩니다. 저장된 전체 데모 파일은 [`sample_data/wafer_demo.csv`](sample_data/wafer_demo.csv)이며, 실행 후 `http://127.0.0.1:8000/api/demo/csv`에서도 다시 받을 수 있습니다. 작은 업로드 테스트 입력은 [`work/test_upload.csv`](work/test_upload.csv)입니다.

## 로컬 실행

터미널 1 — 백엔드:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
python -m uvicorn backend.main:app --reload --port 8000
```

터미널 2 — 프론트엔드:

```powershell
pnpm install
pnpm dev
```

브라우저에서 `http://127.0.0.1:5173`을 엽니다. 프론트엔드는 `/api` 요청을 `http://127.0.0.1:8000`으로 프록시합니다.

## API

- `GET /api/health` — 백엔드 상태
- `GET /api/demo` — 4장 웨이퍼 데모 분석 결과
- `GET /api/demo/csv` — 재현 가능한 데모 CSV
- `POST /api/analyze` — `multipart/form-data`의 `file` 필드로 CSV 업로드

## 테스트

```powershell
python -m unittest backend.test_main -v
pnpm build
```

확인한 smoke test 결과: 데모 4장, 4,228 die 생성/분석, KPI와 패턴 후보 반환, status alias 정규화, 필수 컬럼 누락 거부. 브라우저에서도 `work/test_upload.csv`를 업로드해 수율 75.0%, active die 8, fail die 2가 표시되는 것을 확인했습니다.

## Wafermap 오픈소스 라이선스 검토

참고한 [`wafertools/wafermap`](https://github.com/wafertools/wafermap)는 GitHub README와 npm 패키지 기준 MIT 라이선스입니다. 상업·비공개 제품에서도 사용·수정·재배포할 수 있고, 저작권 고지를 유지해야 합니다. 라이브러리는 React 등에서 쓸 수 있는 pure ES module이며 zoom/pan, tooltip, die selection, spatial analysis, lot view를 제공합니다.

이번 첫 릴리스는 사용자가 지정한 Plotly 시각화 스택과 FastAPI 분석 API를 우선 통합했고, 현재 요구한 PASS/FAIL/INACTIVE map과 상호작용을 Plotly로 충족했습니다. 따라서 wafermap 패키지를 중복으로 넣지 않았습니다. 이후 WM-811K, hard-bin/soft-bin, STDF, reticle overlay가 필요해지면 `@wafertools/wafermap`의 MIT 고지를 포함해 `frontend/map-adapter` 계층으로 교체할 수 있도록 현재 `WaferMap` 컴포넌트를 독립시켜 두었습니다.

## 향후 AI 연결 지점

`backend/main.py`의 `analyze_frame()` 반환값에 `pattern_engine` 메타데이터와 `patterns[].source`가 있습니다. WM-811K 또는 사내 라벨 데이터 기반 모델을 붙일 때 `ai_status`를 활성화하고, rule engine 결과와 별도의 `model_predictions` 배열을 반환하면 UI에서 두 결과를 혼동 없이 비교할 수 있습니다. FastAPI endpoint는 이미 wafer 단위 `wafers` 배열을 반환하므로 batch inference 추가도 가능합니다.

## 레퍼런스에서 가져온 원칙

- Wafermap Showcase의 die-level hover, zoom/pan, 업로드 후 컬럼 계약, lot 비교 흐름
- Yieldsight의 KPI 중심 분석 콘솔, 업로드 → 분석 → 행동의 정보 구조
- MAPx의 radial zone, cluster/scratch/edge signature, wafer-to-wafer 비교와 rule/AI 결과 분리

화면과 코드는 위 흐름을 참고해 새로 구성했으며, 원본 사이트의 레이아웃이나 자산을 복제하지 않았습니다.
