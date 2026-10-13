import { useEffect, useMemo, useRef, useState } from 'react'
import Plot from 'react-plotly.js'
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  BarChart3,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Database,
  FileDown,
  FileUp,
  FlaskConical,
  Gauge,
  Grid2X2,
  Layers3,
  Menu,
  Network,
  RefreshCw,
  ScanSearch,
  Settings2,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
  Zap,
} from 'lucide-react'
import type { Analysis, Die, DieStatus, Pattern, Wafer } from './types'

const API_BASE = import.meta.env.VITE_API_BASE || ''

const fallbackAnalysis: Analysis = {
  source: 'Local preview fallback',
  current_wafer_id: 'WFR-0421',
  wafer_id: 'WFR-0421',
  kpis: { total_die: 24, pass_die: 19, fail_die: 5, inactive_die: 4, yield: 79.2, fail_rate: 20.8 },
  dies: Array.from({ length: 28 }, (_, index) => {
    const x = (index % 7) - 3
    const y = Math.floor(index / 7) - 1
    const status: DieStatus = [4, 10, 17, 18, 24].includes(index) ? 'FAIL' : index > 23 ? 'INACTIVE' : 'PASS'
    return { x, y, status, bin: status === 'PASS' ? 1 : status === 'FAIL' ? 7 : 0 }
  }),
  patterns: [{ name: 'Edge ring', score: 74, evidence: 'Outer radial zone has the highest fail concentration.', source: 'RULE ENGINE' }],
  zones: [
    { zone: 'Core', total: 8, fails: 0, fail_rate: 0 },
    { zone: 'Mid', total: 10, fails: 1, fail_rate: 10 },
    { zone: 'Edge', total: 6, fails: 4, fail_rate: 66.7 },
  ],
  status_counts: [{ status: 'Pass', count: 19 }, { status: 'Fail', count: 5 }, { status: 'Inactive', count: 4 }],
  wafers: [],
  schema: [],
  pattern_engine: { name: 'Rule-based spatial heuristics', status: 'active', ai_status: 'AI model not connected', ai_ready: true },
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

async function loadDemo(): Promise<Analysis> {
  const response = await fetch(`${API_BASE}/api/demo`)
  if (!response.ok) throw new Error('Demo API unavailable')
  return response.json()
}

async function uploadCsv(file: File): Promise<Analysis> {
  const body = new FormData()
  body.append('file', file)
  const response = await fetch(`${API_BASE}/api/analyze`, { method: 'POST', body })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = typeof payload?.detail === 'string' ? payload.detail : payload?.detail?.message || 'CSV validation failed'
    throw new Error(detail)
  }
  return payload
}

function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [analysis, setAnalysis] = useState<Analysis>(fallbackAnalysis)
  const [activeNav, setActiveNav] = useState('Overview')
  const [selectedWafer, setSelectedWafer] = useState('WFR-0421')
  const [isLoading, setIsLoading] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const currentWafer: Wafer = useMemo(() => {
    return analysis.wafers.find((wafer) => wafer.wafer_id === selectedWafer) || analysis
  }, [analysis, selectedWafer])

  useEffect(() => {
    loadDemo()
      .then((payload) => {
        setAnalysis(payload)
        setSelectedWafer(payload.current_wafer_id)
      })
      .catch(() => setToast('API not running — local preview data loaded'))
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const handleFile = async (file?: File) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('CSV 파일만 업로드할 수 있습니다.')
      return
    }
    setIsLoading(true)
    setError('')
    try {
      const payload = await uploadCsv(file)
      setAnalysis(payload)
      setSelectedWafer(payload.current_wafer_id)
      setToast(`${file.name} 분석 완료`)
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '업로드를 처리하지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDemo = async () => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await loadDemo()
      setAnalysis(payload)
      setSelectedWafer(payload.current_wafer_id)
      setToast('데모 웨이퍼 세트로 전환했습니다')
    } catch {
      setAnalysis(fallbackAnalysis)
      setSelectedWafer(fallbackAnalysis.current_wafer_id)
      setToast('로컬 미리보기 데이터를 불러왔습니다')
    } finally {
      setIsLoading(false)
    }
  }

  const handleExport = () => {
    const rows = [
      ['metric', 'value'],
      ['wafer_id', currentWafer.wafer_id],
      ['total_die', currentWafer.kpis.total_die],
      ['pass_die', currentWafer.kpis.pass_die],
      ['fail_die', currentWafer.kpis.fail_die],
      ['inactive_die', currentWafer.kpis.inactive_die],
      ['yield_percent', currentWafer.kpis.yield],
      ['fail_rate_percent', currentWafer.kpis.fail_rate],
      ...currentWafer.patterns.map((pattern) => [`pattern_${pattern.name.toLowerCase().replace(/ /g, '_')}_score`, pattern.score]),
      ...currentWafer.zones.map((zone) => [`zone_${zone.zone.toLowerCase()}_fail_rate`, zone.fail_rate]),
    ]
    const csv = rows.map((row) => row.join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${currentWafer.wafer_id.toLowerCase()}_analysis.csv`
    link.click()
    URL.revokeObjectURL(url)
    setToast('분석 통계 CSV를 저장했습니다')
  }

  const navItems = [
    { label: 'Overview', icon: Grid2X2 },
    { label: 'Wafer Map', icon: ScanSearch },
    { label: 'Yield Trends', icon: BarChart3 },
    { label: 'Pattern Review', icon: Network },
  ]

  return (
    <div className="min-h-screen bg-ink text-slate-800">
      <div className="grain" />
      <div className="relative flex min-h-screen">
        <aside className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col border-r border-line bg-white px-5 py-6 backdrop-blur-xl transition-transform lg:relative lg:translate-x-0`}>
          <div className="flex items-center gap-3 px-2">
            <div className="relative grid h-9 w-9 place-items-center rounded-xl bg-signal shadow-[0_0_28px_rgba(255,117,87,.28)]">
              <div className="h-4 w-4 rounded-full border-2 border-ink" />
              <div className="absolute h-1.5 w-1.5 rounded-full bg-white" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">WFR / OPS</div>
              <div className="text-sm font-bold tracking-tight text-slate-900">WaferIQ</div>
            </div>
          </div>

          <div className="mt-12 px-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-600">Workspace</div>
          <nav className="mt-3 space-y-1">
            {navItems.map(({ label, icon: Icon }) => (
              <button key={label} onClick={() => { setActiveNav(label); setSidebarOpen(false) }} className={`nav-item ${activeNav === label ? 'nav-active' : ''}`}>
                <Icon size={16} strokeWidth={1.8} />
                <span>{label}</span>
                {label === 'Pattern Review' && <span className="ml-auto rounded bg-signal/15 px-1.5 py-0.5 text-[9px] font-bold text-signal">NEW</span>}
              </button>
            ))}
          </nav>

          <div className="mt-10 px-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-600">Operations</div>
          <nav className="mt-3 space-y-1">
            <button className="nav-item"><Database size={16} /><span>Lot browser</span></button>
            <button className="nav-item"><Layers3 size={16} /><span>Compare wafers</span><span className="ml-auto text-[10px] text-slate-600">{analysis.wafers.length || 4}</span></button>
            <button className="nav-item"><Settings2 size={16} /><span>Analysis settings</span></button>
          </nav>

          <div className="mt-auto rounded-2xl border border-line bg-panel p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pipeline</span>
              <span className="flex items-center gap-1.5 text-[10px] text-mint"><span className="h-1.5 w-1.5 rounded-full bg-mint shadow-[0_0_8px_#81e6c5]" />READY</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-[86%] rounded-full bg-gradient-to-r from-signal to-mint" /></div>
            <div className="mt-2 flex justify-between font-mono text-[10px] text-slate-600"><span>Rule engine</span><span>v1.0.0</span></div>
          </div>
        </aside>

        {sidebarOpen && <button aria-label="Close sidebar" className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-[74px] items-center justify-between border-b border-line bg-ink/90 px-5 backdrop-blur-xl md:px-8">
            <div className="flex items-center gap-3">
              <button className="rounded-lg border border-line p-2 text-slate-400 lg:hidden" onClick={() => setSidebarOpen(true)}><Menu size={18} /></button>
              <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex"><span className="h-2 w-2 rounded-full bg-mint" />Yield operations <span className="text-slate-400">/</span> <span className="text-slate-700">{activeNav}</span></div>
            </div>
            <div className="flex items-center gap-2 md:gap-4">
              <div className="hidden items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs text-slate-500 shadow-sm md:flex"><span className="text-slate-500">LOT</span><span className="font-mono text-slate-800">LOT-88412</span><ChevronDown size={13} /></div>
              <button className="relative rounded-lg border border-line bg-white p-2 text-slate-500 shadow-sm hover:text-slate-900"><Bell size={17} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-signal" /></button>
              <div className="flex items-center gap-2 border-l border-line pl-3"><div className="grid h-8 w-8 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">HM</div><span className="hidden text-xs text-slate-700 md:block">H. Min</span></div>
            </div>
          </header>

          <div className="mx-auto max-w-[1536px] px-5 py-7 md:px-8 md:py-10">
            <section className="flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
              <div>
                <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-signal"><Activity size={13} />Inline quality console <span className="text-slate-700">·</span> {analysis.source}</div>
                <h1 className="text-3xl font-bold tracking-[-0.04em] text-slate-900 md:text-[42px]">Wafer quality intelligence<span className="text-signal">.</span></h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Spatial review for yield engineers. Inspect the map, isolate a signature, and hand the next shift a decision-ready signal.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={handleDemo} className="button-secondary"><RefreshCw size={15} />Load sample</button>
                <button onClick={() => inputRef.current?.click()} className="button-primary"><UploadCloud size={15} />Upload CSV</button>
                <button onClick={handleExport} className="button-icon" title="Download analysis CSV"><ArrowDownToLine size={16} /></button>
                <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => handleFile(event.target.files?.[0])} />
              </div>
            </section>

            {error && <div className="mt-6 flex items-start gap-3 rounded-xl border border-signal/30 bg-signal/10 px-4 py-3 text-sm text-signal"><AlertTriangle size={17} className="mt-0.5 shrink-0" /><div className="flex-1">{error}<div className="mt-1 text-xs text-signal/70">Required: wafer_id, die_x, die_y, status. See the CSV schema panel below.</div></div><button onClick={() => setError('')}><X size={15} /></button></div>}

            <section className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Yield" value={formatPercent(currentWafer.kpis.yield)} delta="+2.4% vs. prior lot" tone="mint" icon={<Gauge size={17} />} />
              <KpiCard label="Active die" value={formatNumber(currentWafer.kpis.total_die)} delta={`${formatNumber(currentWafer.kpis.pass_die)} passing`} tone="cyan" icon={<Grid2X2 size={17} />} />
              <KpiCard label="Fail die" value={formatNumber(currentWafer.kpis.fail_die)} delta={`${formatPercent(currentWafer.kpis.fail_rate)} of active`} tone="signal" icon={<AlertTriangle size={17} />} />
              <KpiCard label="Edge risk" value={formatPercent(currentWafer.zones.find((zone) => zone.zone === 'Edge')?.fail_rate || 0)} delta="Rule-based zone signal" tone="amber" icon={<Zap size={17} />} />
            </section>

            <section className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,.8fr)]">
              <div className="panel overflow-hidden">
                <div className="flex flex-col justify-between gap-4 border-b border-line px-5 py-5 sm:flex-row sm:items-center md:px-6">
                  <div><div className="eyebrow">Spatial signature</div><h2 className="mt-1 text-lg font-semibold text-slate-900">Wafer map <span className="font-mono text-sm font-normal text-slate-500">/ {currentWafer.wafer_id}</span></h2></div>
                  <div className="flex items-center gap-4 text-[10px] uppercase tracking-[0.12em] text-slate-500"><LegendDot color="#86c8a9" label="Pass" /><LegendDot color="#dc4b4b" label="Fail" /><LegendDot color="#94a3b8" label="Inactive" /><div className="hidden h-4 w-px bg-line sm:block" /><span className="flex items-center gap-1.5 text-slate-600"><CircleHelp size={13} />Scroll to zoom</span></div>
                </div>
                <div className="relative h-[420px] min-h-[340px] w-full bg-[radial-gradient(circle_at_50%_48%,rgba(37,99,235,.05),transparent_54%)] md:h-[500px]">
                  {isLoading && <div className="absolute inset-0 z-10 grid place-items-center bg-white/70 backdrop-blur-sm"><div className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-xs text-slate-700 shadow-lg"><RefreshCw size={15} className="animate-spin text-signal" />Analyzing die-level data…</div></div>}
                  <WaferMap dies={currentWafer.dies} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-[10px] text-slate-600 md:px-6"><span>Centered coordinates · {formatNumber(currentWafer.kpis.inactive_die)} inactive edge locations hidden from yield</span><span className="font-mono text-slate-500">X / Y DIE GRID</span></div>
              </div>

              <div className="space-y-5">
                <div className="panel p-5 md:p-6">
                  <div className="flex items-start justify-between"><div><div className="eyebrow">Defect signature</div><h2 className="mt-1 text-lg font-semibold text-slate-900">Pattern review</h2></div><span className="badge badge-orange"><FlaskConical size={12} />RULE ENGINE</span></div>
                  <div className="mt-5 space-y-4">{currentWafer.patterns.map((pattern, index) => <PatternRow key={pattern.name} pattern={pattern} rank={index + 1} />)}</div>
                  <div className="mt-5 flex items-start gap-2 rounded-lg border border-cyan/15 bg-cyan/5 p-3 text-[11px] leading-5 text-slate-400"><Sparkles size={14} className="mt-0.5 shrink-0 text-cyan" /><span>AI classification slot is ready. Connect a WM-811K or custom model to replace heuristics when your labeled set is available.</span></div>
                </div>
                <ZoneChart zones={currentWafer.zones} />
              </div>
            </section>

            <section className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
              <div className="panel p-5 md:p-6">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="eyebrow">Lot context</div><h2 className="mt-1 text-lg font-semibold text-slate-900">Wafer comparison</h2><p className="mt-1 text-xs text-slate-500">Select a substrate to pivot the analysis canvas.</p></div><span className="badge badge-neutral"><Layers3 size={12} />{analysis.wafers.length || 1} substrates</span></div>
                <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[560px] text-left"><thead><tr className="border-b border-line text-[10px] uppercase tracking-[0.16em] text-slate-600"><th className="pb-3 pl-1 font-medium">Wafer</th><th className="pb-3 font-medium">Yield</th><th className="pb-3 font-medium">Fail die</th><th className="pb-3 font-medium">Primary signature</th><th className="pb-3 pr-1 text-right font-medium">Status</th></tr></thead><tbody>{(analysis.wafers.length ? analysis.wafers : [analysis]).map((wafer) => <WaferRow key={wafer.wafer_id} wafer={wafer} selected={wafer.wafer_id === selectedWafer} onSelect={() => setSelectedWafer(wafer.wafer_id)} />)}</tbody></table></div>
              </div>
              <div className="panel p-5 md:p-6">
                <div className="flex items-start justify-between"><div><div className="eyebrow">Ingest contract</div><h2 className="mt-1 text-lg font-semibold text-slate-900">CSV schema</h2></div><button onClick={() => { window.open(`${API_BASE}/api/demo/csv`, '_blank'); setToast('예제 CSV 다운로드를 시작했습니다') }} className="text-slate-500 transition hover:text-slate-900" title="Download demo CSV"><FileDown size={16} /></button></div>
                <div className="mt-4 space-y-2">{(analysis.schema.length ? analysis.schema : [{ field: 'wafer_id', type: 'string', required: 'yes', description: 'Wafer identifier' }, { field: 'die_x', type: 'integer', required: 'yes', description: 'X coordinate' }, { field: 'die_y', type: 'integer', required: 'yes', description: 'Y coordinate' }, { field: 'status', type: 'PASS | FAIL | INACTIVE', required: 'yes', description: 'Test result' }]).map((field) => <div key={field.field} className="flex items-center gap-3 rounded-lg border border-line bg-slate-50 px-3 py-2.5"><div className="min-w-[76px] font-mono text-[11px] text-signal">{field.field}</div><div className="flex-1 text-[11px] text-slate-500">{field.description}</div><div className="font-mono text-[10px] text-slate-600">{field.required === 'yes' ? 'REQ' : 'OPT'}</div></div>)}</div>
                <div className="mt-5 flex gap-2 text-[11px] text-slate-500"><ShieldCheck size={14} className="text-mint" /><span>Validated server-side with a 20 MB file limit. Download the sample to test the full flow.</span></div>
              </div>
            </section>

            <footer className="mt-8 flex flex-col justify-between gap-3 border-t border-line py-5 text-[10px] text-slate-600 sm:flex-row sm:items-center"><div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-mint" />LOCAL ANALYSIS MODE <span className="text-slate-700">·</span> No wafer data leaves this workspace</div><div className="flex items-center gap-4"><span>FastAPI + pandas</span><span>React + Plotly</span><span className="flex items-center gap-1"><BookOpen size={12} />v1.0.0</span></div></footer>
          </div>
        </main>
      </div>
      {toast && <div className="toast"><Check size={15} className="text-mint" />{toast}</div>}
    </div>
  )
}

function KpiCard({ label, value, delta, tone, icon }: { label: string; value: string; delta: string; tone: string; icon: React.ReactNode }) {
  return <div className="panel relative overflow-hidden p-5"><div className={`absolute right-[-20px] top-[-25px] h-24 w-24 rounded-full blur-3xl ${tone === 'signal' ? 'bg-signal/10' : tone === 'mint' ? 'bg-mint/10' : tone === 'cyan' ? 'bg-cyan/10' : 'bg-amber-300/10'}`} /><div className="relative flex items-center justify-between"><span className="eyebrow">{label}</span><span className={`kpi-icon ${tone}`}>{icon}</span></div><div className="relative mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-900">{value}</div><div className="relative mt-2 flex items-center gap-1.5 text-[11px] text-slate-500"><span className={`h-1.5 w-1.5 rounded-full ${tone === 'signal' ? 'bg-red-500' : 'bg-mint'}`} />{delta}</div></div>
}

function LegendDot({ color, label }: { color: string; label: string }) { return <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: color }} />{label}</span> }

function WaferMap({ dies }: { dies: Die[] }) {
  const byStatus = (status: DieStatus) => dies.filter((die) => die.status === status)
  const trace = (status: DieStatus, color: string, name: string, size: number) => ({ x: byStatus(status).map((die) => die.x), y: byStatus(status).map((die) => die.y), mode: 'markers', type: 'scattergl', name, text: byStatus(status).map((die) => `X ${die.x} · Y ${die.y}<br>${die.status}<br>Bin ${die.bin}`), hovertemplate: '%{text}<extra></extra>', marker: { color, size, line: { color: '#ffffff', width: status === 'FAIL' ? 1.2 : 0.8 }, opacity: status === 'INACTIVE' ? 0.55 : 0.96 }, showlegend: false })
  return <Plot data={[trace('INACTIVE', '#94a3b8', 'Inactive', 10), trace('PASS', '#86c8a9', 'Pass', 11), trace('FAIL', '#dc4b4b', 'Fail', 12)] as any} layout={{ autosize: true, margin: { l: 28, r: 20, t: 20, b: 28 }, paper_bgcolor: 'transparent', plot_bgcolor: 'transparent', xaxis: { zeroline: false, showgrid: true, gridcolor: 'rgba(148,163,184,.22)', showticklabels: false, fixedrange: false, scaleanchor: 'y' }, yaxis: { zeroline: false, showgrid: true, gridcolor: 'rgba(148,163,184,.22)', showticklabels: false }, hoverlabel: { bgcolor: '#ffffff', bordercolor: '#cbd5e1', font: { color: '#0f172a', family: 'IBM Plex Mono', size: 11 } }, shapes: [{ type: 'circle', x0: -19, y0: -19, x1: 19, y1: 19, line: { color: 'rgba(37,99,235,.28)', width: 1.2, dash: 'dot' }, fillcolor: 'rgba(37,99,235,.025)' }, { type: 'circle', x0: -14, y0: -14, x1: 14, y1: 14, line: { color: 'rgba(100,184,147,.28)', width: 1 }, fillcolor: 'transparent' }], annotations: [{ x: 0, y: -20, text: 'EDGE EXCLUSION', showarrow: false, font: { size: 9, color: '#64748b', family: 'IBM Plex Mono' } }] } as any} config={{ responsive: true, displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'], scrollZoom: true, modeBarFormat: 'unicode' } as any} useResizeHandler style={{ width: '100%', height: '100%' }} />
}

function PatternRow({ pattern, rank }: { pattern: Pattern; rank: number }) {
  return <div className="group"><div className="flex items-center gap-3"><div className={`grid h-7 w-7 place-items-center rounded-lg text-[11px] font-semibold ${rank === 1 ? 'bg-blue-50 text-signal' : 'bg-slate-100 text-slate-500'}`}>0{rank}</div><div className="flex-1"><div className="flex items-center justify-between gap-3"><span className="text-xs font-medium text-slate-800">{pattern.name}</span><span className={`font-mono text-[11px] ${rank === 1 ? 'text-signal' : 'text-slate-500'}`}>{pattern.score}%</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${rank === 1 ? 'bg-signal' : 'bg-slate-300'}`} style={{ width: `${Math.max(pattern.score, 4)}%` }} /></div></div></div><div className="ml-10 mt-2 text-[10px] leading-4 text-slate-500">{pattern.evidence}</div></div>
}

function ZoneChart({ zones }: { zones: Wafer['zones'] }) {
  return <div className="panel p-5 md:p-6"><div className="flex items-start justify-between"><div><div className="eyebrow">Radial zones</div><h2 className="mt-1 text-lg font-semibold text-slate-900">Fail rate by radius</h2></div><div className="rounded-lg bg-blue-50 p-2 text-signal"><BarChart3 size={16} /></div></div><div className="mt-5 space-y-4">{zones.map((zone) => <div key={zone.zone}><div className="mb-1.5 flex items-center justify-between text-[11px]"><span className="text-slate-600">{zone.zone} <span className="font-mono text-[10px] text-slate-500">{zone.fails}/{zone.total}</span></span><span className={zone.fail_rate > 20 ? 'font-mono text-red-600' : 'font-mono text-slate-500'}>{formatPercent(zone.fail_rate)}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${zone.fail_rate > 20 ? 'bg-red-500' : 'bg-cyan/70'}`} style={{ width: `${Math.max(zone.fail_rate, 2)}%` }} /></div></div>)}</div><div className="mt-5 border-t border-line pt-4 text-[10px] leading-4 text-slate-500">Zone boundaries are inferred from active die radial distance. This signal is diagnostic, not an AI classification.</div></div>
}

function WaferRow({ wafer, selected, onSelect }: { wafer: Wafer; selected: boolean; onSelect: () => void }) {
  const pattern = wafer.patterns[0]
  return <tr onClick={onSelect} className={`cursor-pointer border-b border-line/70 text-xs transition hover:bg-slate-50 ${selected ? 'bg-blue-50/60' : ''}`}><td className="py-3.5 pl-1"><div className="flex items-center gap-2.5"><span className={`h-1.5 w-1.5 rounded-full ${selected ? 'bg-signal shadow-[0_0_8px_#2563eb]' : 'bg-slate-400'}`} /><span className={selected ? 'font-mono text-signal' : 'font-mono text-slate-700'}>{wafer.wafer_id}</span></div></td><td className="py-3.5 font-mono text-emerald-700">{formatPercent(wafer.kpis.yield)}</td><td className="py-3.5 font-mono text-slate-700">{wafer.kpis.fail_die}</td><td className="py-3.5 text-slate-500">{pattern?.name || '—'}</td><td className="py-3.5 pr-1 text-right"><span className={`rounded px-2 py-1 text-[10px] ${wafer.kpis.yield > 90 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{wafer.kpis.yield > 90 ? 'IN SPEC' : 'REVIEW'}</span></td></tr>
}

export default App
