import { z } from "zod";
export type Surface = {
  vertices: number[];
  faces: number[];
  sulc: number[];
  labels: number[];
};
export type BrainAsset = {
  left: Surface;
  right: Surface;
  labels: string[];
  mesh: string;
  atlas: string;
};
export type Region = {
  id: number;
  name: string;
  atlas_label: string;
  a: number;
  b: number;
  delta: number;
  correlation: number | null;
  series_a: number[];
  series_b: number[];
  vertices: number;
};
export type ExperimentConfig = {
  title: string;
  hypothesis: string;
  duration: number;
  start_a: number;
  start_b: number;
  modality: "video" | "audio" | "text";
};
export type Result = {
  schema_version: 1;
  id: string;
  source: "demo" | "tribev2";
  created_at: string;
  config: ExperimentConfig;
  provenance: Record<string, string | number>;
  times: number[];
  regions: Region[];
  surface_a: number[];
  surface_b: number[];
  spatial_correlation: number | null;
  warnings: string[];
};
export const ROIS = [
  {
    id: 45,
    name: "Calcarine sulcus",
    label: "S_calcarine",
    network: "Visual",
    a: 0.72,
    b: 0.35,
  },
  {
    id: 43,
    name: "Occipital pole",
    label: "Pole_occipital",
    network: "Visual",
    a: 0.63,
    b: 0.39,
  },
  {
    id: 19,
    name: "Middle occipital gyrus",
    label: "G_occipital_middle",
    network: "Visual",
    a: 0.59,
    b: 0.32,
  },
  {
    id: 33,
    name: "Transverse temporal gyrus",
    label: "G_temp_sup-G_T_transv",
    network: "Auditory",
    a: 0.58,
    b: 0.19,
  },
  {
    id: 34,
    name: "Superior temporal gyrus",
    label: "G_temp_sup-Lateral",
    network: "Auditory",
    a: 0.47,
    b: 0.24,
  },
  {
    id: 57,
    name: "Intraparietal sulcus",
    label: "S_intrapariet_and_P_trans",
    network: "Attention-related",
    a: 0.49,
    b: 0.28,
  },
  {
    id: 27,
    name: "Superior parietal lobule",
    label: "G_parietal_sup",
    network: "Attention-related",
    a: 0.42,
    b: 0.22,
  },
  {
    id: 15,
    name: "Middle frontal gyrus",
    label: "G_front_middle",
    network: "Association",
    a: 0.38,
    b: 0.25,
  },
  {
    id: 6,
    name: "Anterior cingulate",
    label: "G_and_S_cingul-Ant",
    network: "Association",
    a: 0.24,
    b: 0.31,
  },
  {
    id: 30,
    name: "Precuneus",
    label: "G_precuneus",
    network: "Association",
    a: 0.22,
    b: 0.47,
  },
  {
    id: 23,
    name: "Parahippocampal gyrus",
    label: "G_oc-temp_med-Parahip",
    network: "Association",
    a: 0.33,
    b: 0.45,
  },
  {
    id: 29,
    name: "Precentral gyrus",
    label: "G_precentral",
    network: "Motor",
    a: 0.43,
    b: 0.37,
  },
];
export const defaultConfig: ExperimentConfig = {
  title: "Crowded street vs. quiet park",
  hypothesis:
    "A crowded street will produce a larger predicted response than a quiet park in auditory and attention-related regions.",
  duration: 30,
  start_a: 0,
  start_b: 0,
  modality: "video",
};
export const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
export function correlation(a: number[], b: number[]): number | null {
  const ma = mean(a),
    mb = mean(b);
  let cov = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    cov += (a[i] - ma) * (b[i] - mb);
    aa += (a[i] - ma) ** 2;
    bb += (b[i] - mb) ** 2;
  }
  return aa * bb < 1e-16 ? null : cov / Math.sqrt(aa * bb);
}
export function demoResult(
  asset: BrainAsset,
  config: ExperimentConfig,
): Result {
  const times = Array.from({ length: config.duration }, (_, i) => i);
  const regions = ROIS.map((r) => {
    const series_a = times.map(
      (t) => r.a + 0.1 * Math.sin(t * 0.36 + r.id) + 0.045 * Math.sin(t * 1.1),
    );
    const series_b = times.map(
      (t) => r.b + 0.07 * Math.sin(t * 0.32 + r.id + 0.9),
    );
    const a = mean(series_a),
      b = mean(series_b);
    return {
      id: r.id,
      name: r.name,
      atlas_label: r.label,
      a,
      b,
      delta: a - b,
      correlation: correlation(series_a, series_b),
      series_a,
      series_b,
      vertices: [...asset.left.labels, ...asset.right.labels].filter(
        (x) => x === r.id,
      ).length,
    };
  });
  const labels = [...asset.left.labels, ...asset.right.labels];
  const surface = (key: "a" | "b") =>
    labels.map((l, i) => {
      if (l === 42 || l === 0) return 0;
      const r = regions.find((x) => x.id === l);
      return (
        (r?.[key] ?? 0.26 + 0.09 * Math.sin(l * 1.7 + (key === "a" ? 0 : 1))) +
        0.035 * Math.sin(i * 0.075)
      );
    });
  const surface_a = surface("a"),
    surface_b = surface("b");
  return {
    schema_version: 1,
    id: "demo-" + Date.now(),
    source: "demo",
    created_at: new Date().toISOString(),
    config: { ...config },
    provenance: {
      model: "None — synthetic illustrative data",
      mesh: "fsaverage5",
      atlas: "Destrieux 2009",
      units: "arbitrary illustrative units",
      sample_interval_seconds: 1,
      hemisphere_order: "left, right",
    },
    times,
    regions,
    surface_a,
    surface_b,
    spatial_correlation: correlation(
      surface_a.filter((_, i) => labels[i] !== 42 && labels[i] !== 0),
      surface_b.filter((_, i) => labels[i] !== 42 && labels[i] !== 0),
    ),
    warnings: [
      "Illustrative values are hand-designed, not model predictions. They cannot support neuroscience conclusions.",
    ],
  };
}
export function download(
  name: string,
  content: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csv(result: Result) {
  const cell = (v: unknown) =>
    '"' + String(v ?? "").replaceAll('"', '""') + '"';
  const rows = [
    [
      "source",
      "region",
      "atlas_label",
      "mean_a",
      "mean_b",
      "a_minus_b",
      "temporal_r",
      "n_vertices",
      "units",
    ],
    ...result.regions.map((r) => [
      result.source,
      r.name,
      r.atlas_label,
      r.a,
      r.b,
      r.delta,
      r.correlation,
      r.vertices,
      result.provenance.units,
    ]),
  ];
  return rows.map((r) => r.map(cell).join(",")).join("\n");
}

// Validate data from a user-configured service before it reaches the renderer.

const finite = z.number().finite();
const surfaceSchema = z.object({
  vertices: z.array(finite).length(30726),
  faces: z.array(z.number().int().min(0).max(10241)),
  sulc: z.array(finite).length(10242),
  labels: z.array(z.number().int().min(0)).length(10242),
});
export const brainSchema = z.object({
  left: surfaceSchema,
  right: surfaceSchema,
  labels: z.array(z.string()),
  mesh: z.literal("fsaverage5"),
  atlas: z.string(),
});
export const healthSchema = z.object({
  inference_enabled: z.boolean(),
  dependencies_ready: z.boolean(),
});
export const jobSchema = z.object({
  id: z.string(),
  status: z.enum(["queued", "running", "completed", "failed"]),
  message: z.string().optional(),
});
export const resultSchema: z.ZodType<Result> = z
  .object({
    schema_version: z.literal(1),
    id: z.string(),
    source: z.enum(["demo", "tribev2"]),
    created_at: z.string(),
    config: z.object({
      title: z.string(),
      hypothesis: z.string(),
      duration: finite,
      start_a: finite,
      start_b: finite,
      modality: z.enum(["video", "audio", "text"]),
    }),
    provenance: z.record(z.union([z.string(), finite])),
    times: z.array(finite).min(3),
    regions: z
      .array(
        z.object({
          id: finite,
          name: z.string(),
          atlas_label: z.string(),
          a: finite,
          b: finite,
          delta: finite,
          correlation: finite.nullable(),
          series_a: z.array(finite),
          series_b: z.array(finite),
          vertices: finite,
        }),
      )
      .min(1),
    surface_a: z.array(finite).length(20484),
    surface_b: z.array(finite).length(20484),
    spatial_correlation: finite.nullable(),
    warnings: z.array(z.string()),
  })
  .refine(
    (r) =>
      r.regions.every(
        (x) =>
          x.series_a.length === r.times.length &&
          x.series_b.length === r.times.length,
      ),
    "Region time series must align with timestamps",
  );
