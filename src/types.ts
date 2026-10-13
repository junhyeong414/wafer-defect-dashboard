export type DieStatus = 'PASS' | 'FAIL' | 'INACTIVE'

export type Die = {
  x: number
  y: number
  status: DieStatus
  bin: number
}

export type Kpis = {
  total_die: number
  pass_die: number
  fail_die: number
  inactive_die: number
  yield: number
  fail_rate: number
}

export type Pattern = {
  name: string
  score: number
  evidence: string
  source: string
}

export type Zone = {
  zone: string
  total: number
  fails: number
  fail_rate: number
}

export type Wafer = {
  wafer_id: string
  kpis: Kpis
  dies: Die[]
  patterns: Pattern[]
  zones: Zone[]
  status_counts: { status: string; count: number }[]
}

export type Analysis = Wafer & {
  source: string
  current_wafer_id: string
  wafers: Wafer[]
  schema: { field: string; type: string; required: string; description: string }[]
  pattern_engine: { name: string; status: string; ai_status: string; ai_ready: boolean }
}
