"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Brain,
  FlaskConical,
  Layers3,
  Settings2,
  BookOpen,
  Upload,
  Play,
  ArrowUpRight,
  Info,
  X,
  Download,
  RotateCcw,
  Check,
  LoaderCircle,
  AudioLines,
  FileText,
  Film,
  ExternalLink,
} from "lucide-react";
import BrainViewer from "@/components/brain-viewer";
import ResponseChart from "@/components/response-chart";
import {
  BrainAsset,
  Result,
  ExperimentConfig,
  ROIS,
  defaultConfig,
  demoResult,
  csv,
  download,
  brainSchema,
  healthSchema,
  jobSchema,
  resultSchema,
} from "@/lib/neurosim";

type Stimulus = { file: File; url: string };
const fmt = (n: number | null) => (n === null ? "—" : n.toFixed(3));
export default function Home() {
  const [asset, setAsset] = useState<BrainAsset | null>(null),
    [result, setResult] = useState<Result | null>(null),
    [config, setConfig] = useState<ExperimentConfig>(defaultConfig);
  const [mode, setMode] = useState<"demo" | "live">("demo"),
    [tab, setTab] = useState("Experiment"),
    [modal, setModal] = useState(false),
    [endpoint, setEndpoint] = useState("http://127.0.0.1:8000"),
    [token, setToken] = useState("");
  const [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [connected, setConnected] = useState(false);
  const [a, setA] = useState<Stimulus | null>(null),
    [b, setB] = useState<Stimulus | null>(null),
    [selected, setSelected] = useState<number | null>(null),
    [layer, setLayer] = useState<"difference" | "a" | "b">("difference"),
    [view, setView] = useState<"lateral" | "dorsal" | "anterior">("lateral"),
    [threshold, setThreshold] = useState(0),
    [query, setQuery] = useState(""),
    [network, setNetwork] = useState("All regions");
  const [textA, setTextA] = useState(""),
    [textB, setTextB] = useState("");
  const [resetView, setResetView] = useState(0);
  const job = useRef<{ id: string; endpoint: string; token: string } | null>(
    null,
  );
  const polling = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const abort = new AbortController();
    fetch("/brain/fsaverage5.json", { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw Error("Cortical surface could not be loaded.");
        return r.json().then((x) => brainSchema.parse(x));
      })
      .then((x: BrainAsset) => {
        setAsset(x);
        setResult(demoResult(x, defaultConfig));
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    const saved = localStorage.getItem("neurosim.endpoint");
    if (saved) setEndpoint(saved);
    return () => {
      abort.abort();
      if (polling.current) clearTimeout(polling.current);
    };
  }, []);
  useEffect(
    () => () => {
      if (a) URL.revokeObjectURL(a.url);
    },
    [a],
  );
  useEffect(
    () => () => {
      if (b) URL.revokeObjectURL(b.url);
    },
    [b],
  );
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);
  const values = useMemo(
    () =>
      result
        ? result.surface_a.map((v, i) =>
            layer === "a"
              ? v
              : layer === "b"
                ? result.surface_b[i]
                : v - result.surface_b[i],
          )
        : [],
    [result, layer],
  );
  const scale = useMemo(
    () =>
      Math.max(
        0.01,
        ...(result && layer !== "difference"
          ? [...result.surface_a, ...result.surface_b]
          : values
        ).map(Math.abs),
      ),
    [values, result, layer],
  );
  const regions = useMemo(
    () =>
      result?.regions
        .filter(
          (r) =>
            r.name.toLowerCase().includes(query.toLowerCase()) &&
            (network === "All regions" ||
              ROIS.find((x) => x.id === r.id)?.network === network),
        )
        .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)) ?? [],
    [result, query, network],
  );
  const currentRegion =
    result?.regions.find((r) => r.id === selected) ??
    regions[0] ??
    result?.regions[0];
  const stale =
    result && JSON.stringify(result.config) !== JSON.stringify(config);
  function update<T extends keyof ExperimentConfig>(
    key: T,
    value: ExperimentConfig[T],
  ) {
    setConfig((c) => ({ ...c, [key]: value }));
  }
  function chooseFile(file: File | undefined, which: "a" | "b") {
    if (!file) return;
    setError("");
    if (file.size > 250 * 1024 * 1024) {
      setError("Each stimulus must be under 250 MB.");
      return;
    }
    const extensions =
      config.modality === "video"
        ? ["mp4", "mov", "avi", "mkv", "webm"]
        : ["wav", "mp3", "flac", "ogg"];
    if (!extensions.includes(file.name.split(".").pop()!.toLowerCase())) {
      setError(`Choose a supported ${config.modality} file.`);
      return;
    }
    const item = { file, url: URL.createObjectURL(file) };
    if (which === "a") setA(item);
    else setB(item);
    setMode("live");
    setResult(null);
  }
  function switchMode(value: "demo" | "live") {
    setMode(value);
    setError("");
    setStatus("");
    const next = {
      ...config,
      title: value === "demo" ? defaultConfig.title : "Untitled comparison",
      start_a: 0,
      start_b: 0,
    };
    setConfig(next);
    setResult(value === "demo" && asset ? demoResult(asset, next) : null);
    setSelected(null);
  }
  async function api(
    path: string,
    options: RequestInit = {},
    connection = { endpoint, token },
  ) {
    const url = new URL(connection.endpoint);
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )
    )
      throw Error("Use HTTPS for a remote GPU service.");
    if (url.username || url.password || url.search || url.hash)
      throw Error(
        "Enter a plain service URL without credentials, query or fragment.",
      );
    const response = await fetch(
      connection.endpoint.replace(/\/$/, "") + path,
      {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${connection.token}`,
        },
        signal: AbortSignal.timeout(120000),
      },
    );
    const data: unknown = await response.json();
    if (!response.ok) {
      const detail =
        data && typeof data === "object" && "detail" in data
          ? data.detail
          : null;
      throw Error(
        typeof detail === "string"
          ? detail
          : `Request failed (${response.status}).`,
      );
    }
    return data;
  }
  async function checkConnection() {
    setStatus("Checking service…");
    setError("");
    setConnected(false);
    try {
      const x = healthSchema.parse(await api("/health"));
      localStorage.setItem("neurosim.endpoint", endpoint);
      if (!x.inference_enabled)
        throw Error(
          "Service is reachable, but TRIBE inference is disabled. Enable it on the GPU server.",
        );
      if (!x.dependencies_ready)
        throw Error(
          "Service is reachable. Install TRIBE and ffmpeg before running inference.",
        );
      setConnected(true);
      setStatus("Service connected. Model loads on the first run.");
    } catch (e) {
      setStatus("");
      setError(e instanceof Error ? e.message : "Could not reach the service.");
    }
  }
  async function poll() {
    const active = job.current;
    if (!active) return;
    try {
      const x = jobSchema.parse(
        await api(`/experiments/${active.id}`, {}, active),
      );
      setStatus(x.message ?? x.status);
      if (x.status === "completed") {
        const r = resultSchema.parse(
          await api(`/experiments/${active.id}/result`, {}, active),
        );
        setResult(r);
        setBusy(false);
        setSelected(null);
        setStatus("Comparison ready.");
      } else if (x.status === "failed") {
        setError(x.message ?? "Inference failed.");
        setBusy(false);
      } else polling.current = setTimeout(poll, 2500);
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : "Connection interrupted.") +
          " The job may still be running. Use Resume status to reconnect.",
      );
      setBusy(false);
    }
  }
  async function run() {
    setError("");
    setStatus("");
    setSelected(null);
    setThreshold(0);
    if (mode === "demo") {
      if (asset) {
        setResult(demoResult(asset, config));
        setStatus("Illustrative comparison updated.");
      }
      return;
    }
    if (!connected) {
      setModal(true);
      setError("Connect your GPU service before running TRIBE.");
      return;
    }
    if (
      config.modality === "text" ? !textA.trim() || !textB.trim() : !a || !b
    ) {
      setError("Add both stimuli before running a comparison.");
      return;
    }
    const form = new FormData();
    form.append("config", JSON.stringify(config));
    form.append(
      "stimulus_a",
      config.modality === "text"
        ? new File([textA], "stimulus-a.txt", { type: "text/plain" })
        : a!.file,
    );
    form.append(
      "stimulus_b",
      config.modality === "text"
        ? new File([textB], "stimulus-b.txt", { type: "text/plain" })
        : b!.file,
    );
    setBusy(true);
    setResult(null);
    setStatus("Uploading stimuli…");
    try {
      const response = jobSchema.parse(
        await api("/experiments", { method: "POST", body: form }),
      );
      job.current = { id: response.id, endpoint, token };
      await poll();
    } catch (e) {
      setBusy(false);
      setError(
        e instanceof Error ? e.message : "Could not start the experiment.",
      );
    }
  }
  function selectModality(value: ExperimentConfig["modality"]) {
    setConfig((c) => ({ ...c, modality: value, start_a: 0, start_b: 0 }));
    setA(null);
    setB(null);
    setResult(null);
    setMode("live");
  }
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: object,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context) return;
    const life = new AbortController();
    void Promise.resolve(
      context.registerTool(
        {
          name: "read_neurosim_comparison",
          description:
            "Read the displayed comparison, its source and region means. Does not run inference.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute(input: unknown) {
            if (
              typeof input !== "object" ||
              input === null ||
              Array.isArray(input) ||
              Object.keys(input).length
            )
              throw Error("Expected an empty object.");
            return result
              ? {
                  id: result.id,
                  source: result.source,
                  config: result.config,
                  regions: result.regions.map(
                    ({ series_a, series_b, ...r }) => r,
                  ),
                  warnings: result.warnings,
                }
              : { status: "No comparison available" };
          },
        },
        { signal: life.signal },
      ),
    ).catch(() => {});
    return () => life.abort();
  }, [result]);
  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <Brain size={25} />
        </div>
        <button
          className={tab === "Experiment" ? "rail-active" : ""}
          onClick={() => setTab("Experiment")}
          aria-label="Experiment"
        >
          <FlaskConical size={21} />
        </button>
        <button
          className={tab === "Methodology" ? "rail-active" : ""}
          onClick={() => setTab("Methodology")}
          aria-label="Methodology"
        >
          <BookOpen size={21} />
        </button>
        <button onClick={() => setModal(true)} aria-label="Model connection">
          <Settings2 size={21} />
        </button>
        <span className="rail-bottom">NS</span>
      </aside>
      <div className="workspace">
        <header>
          <a className="wordmark" href="/">
            neuro<span>sim</span>
            <small>STIMULUS LAB</small>
          </a>
          <span className="version">
            Research preview <b>v0.1</b>
          </span>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">IN SILICO · IN PERSPECTIVE</div>
              <h1>A different world. A different response.</h1>
              <p>Compare sensory experiences across the human cortex.</p>
            </div>
            <button className="button secondary" onClick={() => setModal(true)}>
              <Settings2 size={16} />
              {connected ? "Service connected" : "Model connection"}
            </button>
          </div>
          <nav className="tabs">
            {["Experiment", "Methodology"].map((t) => (
              <button
                key={t}
                className={tab === t ? "selected" : ""}
                onClick={() => setTab(t)}
              >
                {t === "Experiment" ? (
                  <FlaskConical size={16} />
                ) : (
                  <BookOpen size={16} />
                )}{" "}
                {t}
              </button>
            ))}
            <span className={result?.source === "tribev2" ? "live-label" : ""}>
              <span className="demo-dot" />
              {mode === "demo"
                ? "Illustrative demo"
                : result
                  ? "TRIBE v2 prediction"
                  : "Live inference"}
            </span>
          </nav>
          {tab === "Methodology" ? (
            <section className="methodology panel">
              <div className="eyebrow">READ BEFORE INTERPRETING</div>
              <h1>One model. A testable question.</h1>
              <p>
                NeuroSim compares model predictions for two stimuli. It is a
                tool for exploratory, in-silico neuroscience, not a measure of
                an individual’s perception, attention, emotions, or health.
              </p>
              <div className="method-grid">
                <article>
                  <h2>01 · Match the experiment</h2>
                  <p>
                    Choose the same modality, equal clip durations, and
                    intentional start times. Record your hypothesis before
                    running. Lighting, camera motion, sound level, and speech
                    can all differ between street and park videos; a single pair
                    cannot isolate an environmental effect.
                  </p>
                </article>
                <article>
                  <h2>02 · Predict on a shared cortex</h2>
                  <p>
                    The official TRIBE v2 pipeline converts video, audio, or
                    text into features and predicts average-subject fMRI-like
                    responses on fsaverage5: 10,242 vertices per hemisphere.
                    Text is synthesized into speech by the upstream pipeline, so
                    it is not a pure reading condition.
                  </p>
                </article>
                <article>
                  <h2>03 · Compare descriptively</h2>
                  <p>
                    Maps show temporal means with a shared symmetric color
                    scale. Contrasts are A − B in native model units, not
                    percent BOLD change. ROI values are unweighted vertex means
                    in 12 bilateral Destrieux anatomical regions. Functional
                    groupings are approximate associations, not a functional
                    atlas.
                  </p>
                </article>
                <article>
                  <h2>04 · Keep the limits visible</h2>
                  <p>
                    Spatial correlation compares vertex-wise temporal means,
                    excluding the medial wall. ROI correlation compares matched
                    time series. Correlation is undefined for constant signals.
                    Timepoints are autocorrelated; no p-values or causal claims
                    are produced. Validate hypotheses across multiple controlled
                    stimuli and independent human data.
                  </p>
                </article>
              </div>
              <div className="method-callout">
                <Info size={20} />
                <p>
                  TRIBE’s official configuration includes a 5-second hemodynamic
                  offset. NeuroSim preserves the returned segment timestamps and
                  does not apply a second shift. Exported results record timing,
                  atlas, source hashes, and model provenance.
                </p>
              </div>
              <div className="source-links">
                <a
                  href="https://huggingface.co/facebook/tribev2"
                  target="_blank"
                  rel="noreferrer"
                >
                  Model card <ExternalLink size={14} />
                </a>
                <a
                  href="https://github.com/facebookresearch/tribev2"
                  target="_blank"
                  rel="noreferrer"
                >
                  Official implementation <ExternalLink size={14} />
                </a>
                <a
                  href="https://github.com/aditi1421/Neuro-TRIBE"
                  target="_blank"
                  rel="noreferrer"
                >
                  NeuroSim source <ExternalLink size={14} />
                </a>
              </div>
              <p className="muted">
                Model weights: CC BY-NC 4.0. Review upstream and backbone
                licenses before use. Demo values are constructed for interface
                exploration and are not evidence.
              </p>
            </section>
          ) : (
            <>
              <div className="experiment-grid">
                <section className="panel stimulus-panel">
                  <div className="panel-title">
                    <h2>Stimulus pair</h2>
                    <span>01 / INPUT</span>
                  </div>
                  <div className="segmented source-toggle">
                    <button
                      disabled={busy}
                      className={mode === "demo" ? "active" : ""}
                      onClick={() => switchMode("demo")}
                    >
                      Sample experiment
                    </button>
                    <button
                      disabled={busy}
                      className={mode === "live" ? "active" : ""}
                      onClick={() => switchMode("live")}
                    >
                      Your stimuli
                    </button>
                  </div>
                  <label className="experiment-name">
                    Experiment name
                    <input
                      value={config.title}
                      disabled={busy}
                      maxLength={200}
                      onChange={(e) => update("title", e.target.value)}
                    />
                  </label>
                  {mode === "live" && (
                    <div className="modality-row">
                      {(["video", "audio", "text"] as const).map((m) => (
                        <button
                          disabled={busy}
                          className={config.modality === m ? "active" : ""}
                          onClick={() => selectModality(m)}
                          key={m}
                        >
                          {m === "video" ? (
                            <Film size={14} />
                          ) : m === "audio" ? (
                            <AudioLines size={14} />
                          ) : (
                            <FileText size={14} />
                          )}{" "}
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                  {(["a", "b"] as const).map((which, i) => {
                    const stim = which === "a" ? a : b;
                    return (
                      <div className="stimulus" key={which}>
                        <div className="stimulus-label">
                          <b className={`condition ${which}`}>
                            {which.toUpperCase()}
                          </b>
                          <h3>
                            {mode === "demo"
                              ? i
                                ? "Quiet park"
                                : "Crowded street"
                              : (stim?.file.name ??
                                `Stimulus ${which.toUpperCase()}`)}
                          </h3>
                          <span>
                            {mode === "demo"
                              ? "SCENARIO"
                              : config.modality.toUpperCase()}
                          </span>
                        </div>
                        {mode === "demo" ? (
                          <div
                            className={`sample-preview ${i ? "park" : "street"}`}
                          >
                            <Activity size={36} />
                            <div>
                              {i ? "A moment of quiet" : "City in motion"}
                              <small>Synthetic example · no source video</small>
                            </div>
                          </div>
                        ) : config.modality === "text" ? (
                          <textarea
                            className="text-stimulus"
                            aria-label={`Text stimulus ${which.toUpperCase()}`}
                            placeholder="Enter a passage to compare…"
                            value={i ? textB : textA}
                            maxLength={5000}
                            disabled={busy}
                            onChange={(e) =>
                              i
                                ? setTextB(e.target.value)
                                : setTextA(e.target.value)
                            }
                          />
                        ) : (
                          <>
                            <div
                              className={`media-preview ${!stim ? "empty" : ""}`}
                            >
                              {stim ? (
                                config.modality === "video" ? (
                                  <video
                                    src={stim.url}
                                    controls
                                    preload="metadata"
                                  />
                                ) : (
                                  <audio src={stim.url} controls />
                                )
                              ) : (
                                <>
                                  <Upload size={23} />
                                  <span>Add a {config.modality} file</span>
                                </>
                              )}
                            </div>
                            <label className="upload">
                              <Upload size={14} />
                              {stim ? "Replace" : "Upload"} stimulus{" "}
                              {which.toUpperCase()}
                              <input
                                type="file"
                                disabled={busy}
                                accept={
                                  config.modality === "video"
                                    ? ".mp4,.mov,.avi,.mkv,.webm"
                                    : ".wav,.mp3,.flac,.ogg"
                                }
                                onChange={(e) => {
                                  chooseFile(e.target.files?.[0], which);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                          </>
                        )}
                        {mode === "live" && config.modality !== "text" && (
                          <label className="start-time">
                            Clip start{" "}
                            <input
                              aria-label={`Stimulus ${which.toUpperCase()} start time`}
                              type="number"
                              min={0}
                              max={3600}
                              step={1}
                              disabled={busy}
                              value={i ? config.start_b : config.start_a}
                              onChange={(e) =>
                                update(
                                  i ? "start_b" : "start_a",
                                  Number(e.target.value),
                                )
                              }
                            />{" "}
                            sec
                          </label>
                        )}
                      </div>
                    );
                  })}
                  <div className="control-label">
                    MATCHED WINDOW <span>{config.duration} seconds</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={60}
                    step={5}
                    disabled={busy}
                    value={config.duration}
                    onChange={(e) => update("duration", Number(e.target.value))}
                    aria-label="Matched duration"
                  />
                  <button
                    className="button primary run"
                    disabled={busy || !asset}
                    onClick={run}
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Play size={15} />
                    )}{" "}
                    {busy
                      ? "Predicting responses…"
                      : mode === "demo"
                        ? "Explore sample comparison"
                        : "Run TRIBE comparison"}
                  </button>
                  <p className="muted fine">
                    {mode === "demo"
                      ? "Illustrative data, not model predictions."
                      : config.modality === "text"
                        ? "Text is sent to your GPU service and upstream Google TTS when you run."
                        : "Files are sent only to your configured GPU service when you run."}
                  </p>
                </section>
                <section className="panel cortex-panel">
                  <div className="panel-title">
                    <div>
                      <h2>Cortical response</h2>
                      <p>
                        {result
                          ? `Temporal mean · ${result.config.duration}s requested window`
                          : "Run a comparison to view predicted responses"}
                      </p>
                    </div>
                    <span>
                      <Layers3 size={16} /> fsaverage5
                    </span>
                  </div>
                  <div className="viewer-toolbar">
                    <div className="segmented">
                      {(["difference", "a", "b"] as const).map((l) => (
                        <button
                          className={layer === l ? "active" : ""}
                          onClick={() => {
                            setLayer(l);
                            setThreshold(0);
                          }}
                          key={l}
                        >
                          {l === "difference"
                            ? "Contrast A − B"
                            : `Stimulus ${l.toUpperCase()}`}
                        </button>
                      ))}
                    </div>
                    <button
                      className="icon-button"
                      aria-label="Reset cortical view"
                      onClick={() => {
                        setView("lateral");
                        setResetView((n) => n + 1);
                        setSelected(null);
                        setThreshold(0);
                      }}
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>
                  <div className="brain-stage">
                    {asset && result ? (
                      <BrainViewer
                        asset={asset}
                        values={values}
                        selected={selected}
                        threshold={threshold}
                        view={view}
                        scale={scale}
                        resetView={resetView}
                      />
                    ) : (
                      <div className="brain-loading">
                        <Brain size={100} strokeWidth={0.6} />
                        <p>
                          {busy
                            ? status
                            : asset
                              ? "Your next question starts with two stimuli."
                              : "Loading anatomical surface…"}
                        </p>
                      </div>
                    )}
                    <div className="brain-badge">
                      {result?.source === "demo"
                        ? "ILLUSTRATIVE MAP"
                        : result
                          ? "PREDICTED RESPONSE"
                          : "AWAITING COMPARISON"}
                    </div>
                    <div className="orientation-label">
                      L <span>·</span> R
                    </div>
                    {selected !== null && (
                      <button
                        className="region-chip"
                        onClick={() => setSelected(null)}
                      >
                        {ROIS.find((r) => r.id === selected)?.name}
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  <div className="viewer-bottom">
                    <div className="view-buttons">
                      {(["lateral", "dorsal", "anterior"] as const).map((v) => (
                        <button
                          key={v}
                          className={view === v ? "active" : ""}
                          onClick={() => setView(v)}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <span>Drag to rotate · Scroll to zoom</span>
                  </div>
                  <div className="brain-footer">
                    <span>
                      {layer === "difference" ? "B greater" : "Negative"}
                    </span>
                    <div>
                      <div className="color-scale" />
                      <div className="scale-labels">
                        <span>−{scale.toFixed(2)}</span>
                        <span>0</span>
                        <span>+{scale.toFixed(2)}</span>
                      </div>
                    </div>
                    <span>
                      {layer === "difference" ? "A greater" : "Positive"}
                    </span>
                  </div>
                  <label className="threshold">
                    Display threshold{" "}
                    <input
                      type="range"
                      min={0}
                      max={scale}
                      step={scale / 100}
                      value={Math.min(threshold, scale)}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                    />
                    <span>{threshold.toFixed(2)}</span>
                  </label>
                  <p className="threshold-note">
                    Color cutoff only · not a significance threshold
                  </p>
                </section>
              </div>
              <div className="feedback" aria-live="polite">
                {error && (
                  <div className="error">
                    <Info size={16} />
                    <span>{error}</span>
                    {job.current && !busy && (
                      <button
                        onClick={() => {
                          setError("");
                          setBusy(true);
                          void poll();
                        }}
                      >
                        Resume status
                      </button>
                    )}
                  </div>
                )}
                {status && !error && (
                  <div className="status">
                    <Check size={15} />
                    {status}
                  </div>
                )}
                {stale && (
                  <div className="stale">
                    Inputs changed. Displayed results still belong to the
                    previous run.
                  </div>
                )}
              </div>
              <section className="hypothesis panel">
                <div>
                  <FlaskConical size={20} />
                  <div>
                    <h2>The question behind the comparison</h2>
                    <p>Record a prediction before you run.</p>
                  </div>
                </div>
                <label className="sr-only" htmlFor="hypothesis">
                  Experiment hypothesis
                </label>
                <textarea
                  id="hypothesis"
                  value={config.hypothesis}
                  disabled={busy}
                  maxLength={2000}
                  onChange={(e) => update("hypothesis", e.target.value)}
                />
              </section>
              {result && currentRegion && (
                <>
                  <div className="results-heading">
                    <div>
                      <div className="eyebrow">02 / OBSERVE</div>
                      <h2>
                        {result.source === "demo"
                          ? "Explore the sample results"
                          : "Comparison results"}
                      </h2>
                    </div>
                    <div className="export-buttons">
                      <button
                        className="button secondary"
                        onClick={() =>
                          download(
                            `neurosim-${result.source}-regions.csv`,
                            csv(result),
                            "text/csv",
                          )
                        }
                      >
                        <Download size={14} /> CSV
                      </button>
                      <button
                        className="button secondary"
                        onClick={() =>
                          download(
                            `neurosim-${result.id}.json`,
                            JSON.stringify(result, null, 2),
                          )
                        }
                      >
                        <Download size={14} /> Experiment JSON
                      </button>
                    </div>
                  </div>
                  <div className="metrics">
                    <div>
                      <span>Spatial similarity</span>
                      <strong>
                        {fmt(result.spatial_correlation)} <small>r</small>
                      </strong>
                      <p>Across cortical vertex means</p>
                    </div>
                    <div>
                      <span>Largest ROI contrast</span>
                      <strong>
                        {fmt(
                          [...result.regions].sort(
                            (x, y) => Math.abs(y.delta) - Math.abs(x.delta),
                          )[0].delta,
                        )}{" "}
                        <small>A − B</small>
                      </strong>
                      <p>
                        {
                          [...result.regions].sort(
                            (x, y) => Math.abs(y.delta) - Math.abs(x.delta),
                          )[0].name
                        }
                      </p>
                    </div>
                    <div>
                      <span>Matched samples</span>
                      <strong>
                        {result.times.length} <small>timepoints</small>
                      </strong>
                      <p>
                        {result.times[0].toFixed(1)}–
                        {result.times.at(-1)!.toFixed(1)} seconds · returned
                        timeline
                      </p>
                    </div>
                    <div>
                      <span>Analysis space</span>
                      <strong>
                        20,484 <small>vertices</small>
                      </strong>
                      <p>12 bilateral anatomical ROIs</p>
                    </div>
                  </div>
                  <div className="analysis-grid">
                    <section className="panel">
                      <div className="panel-title">
                        <div>
                          <h2>Response over time</h2>
                          <p>{currentRegion.name} · bilateral mean</p>
                        </div>
                        <div className="chart-legend">
                          <span>A</span>
                          <span>B</span>
                        </div>
                      </div>
                      <ResponseChart
                        region={currentRegion}
                        times={result.times}
                      />
                      <div className="chart-caption">
                        <span>
                          {result.source === "demo"
                            ? "Illustrative units"
                            : "Native model units"}
                        </span>
                        <span>
                          Temporal r = {fmt(currentRegion.correlation)}
                        </span>
                      </div>
                    </section>
                    <section className="panel region-panel">
                      <div className="panel-title">
                        <div>
                          <h2>Region contrasts</h2>
                          <p>Select a region to inspect its response</p>
                        </div>
                        <span>A − B</span>
                      </div>
                      <div className="region-filters">
                        <input
                          aria-label="Find a region"
                          placeholder="Find a region…"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                        <select
                          aria-label="Region group"
                          value={network}
                          onChange={(e) => setNetwork(e.target.value)}
                        >
                          {[
                            "All regions",
                            "Visual",
                            "Auditory",
                            "Attention-related",
                            "Association",
                            "Motor",
                          ].map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                      </div>
                      <div className="region-list">
                        {regions.map((r) => (
                          <button
                            key={r.id}
                            className={
                              selected === r.id
                                ? "region-row selected"
                                : "region-row"
                            }
                            onClick={() =>
                              setSelected(selected === r.id ? null : r.id)
                            }
                          >
                            <span>{r.name}</span>
                            <span className="contrast-track">
                              <i
                                style={{
                                  width: `${Math.min(Math.abs(r.delta) / scale, 1) * 48}%`,
                                  left: r.delta >= 0 ? "50%" : undefined,
                                  right: r.delta < 0 ? "50%" : undefined,
                                  background:
                                    r.delta >= 0
                                      ? "var(--orange)"
                                      : "var(--cyan)",
                                }}
                              />
                            </span>
                            <b
                              className={r.delta >= 0 ? "positive" : "negative"}
                            >
                              {r.delta >= 0 ? "+" : ""}
                              {r.delta.toFixed(3)}
                            </b>
                          </button>
                        ))}
                        {!regions.length && (
                          <p className="no-regions">No matching regions.</p>
                        )}
                      </div>
                    </section>
                  </div>
                  <div className="provenance">
                    <Info size={15} />
                    <span>{result.warnings[0]}</span>
                  </div>
                </>
              )}
              <div className="research-note">
                <Info size={16} />
                <span>
                  Explore a hypothesis, not a diagnosis. Predictions are not
                  measurements of a person’s brain.
                </span>
                <button onClick={() => setTab("Methodology")}>
                  Read methodology <ArrowUpRight size={14} />
                </button>
              </div>
            </>
          )}
        </main>
        <footer>
          NEUROSIM <span>Built for questions worth exploring.</span>
          <a
            href="https://huggingface.co/facebook/tribev2"
            target="_blank"
            rel="noreferrer"
          >
            TRIBE v2 · Meta FAIR
          </a>
        </footer>
      </div>
      <dialog
        ref={dialog}
        className="connection-dialog"
        onCancel={() => setModal(false)}
        onClick={(e) => {
          if (e.target === dialog.current) setModal(false);
        }}
      >
        <div className="dialog-heading">
          <div>
            <div className="eyebrow">MODEL CONNECTION</div>
            <h2>Bring your GPU. Keep your questions.</h2>
          </div>
          <button
            onClick={() => setModal(false)}
            aria-label="Close model connection"
          >
            <X size={19} />
          </button>
        </div>
        <p>
          Connect the NeuroSim Python service running on your GPU server. The
          sample experiment works without a connection.
        </p>
        <label>
          Service URL
          <input
            type="url"
            value={endpoint}
            disabled={busy}
            onChange={(e) => {
              setEndpoint(e.target.value);
              setConnected(false);
            }}
            placeholder="https://your-gpu-service"
          />
        </label>
        <label>
          Service access key
          <input
            type="password"
            autoComplete="off"
            value={token}
            disabled={busy}
            onChange={(e) => {
              setToken(e.target.value);
              setConnected(false);
            }}
            placeholder="NEURO_API_KEY from your server"
          />
        </label>
        <p className="muted">
          The access key stays in memory for this tab. Your Hugging Face token
          belongs on the GPU server.
        </p>
        <button
          className="button primary"
          onClick={checkConnection}
          disabled={busy}
        >
          <Activity size={16} /> Test connection
        </button>
        <div
          aria-live="polite"
          className={error ? "connection-error" : "connection-status"}
        >
          {error || status}
        </div>
        <a
          className="setup-link"
          href="https://github.com/aditi1421/Neuro-TRIBE/blob/main/docs/GPU_SETUP.md"
          target="_blank"
          rel="noreferrer"
        >
          GPU setup guide <ExternalLink size={14} />
        </a>
      </dialog>
    </div>
  );
}
