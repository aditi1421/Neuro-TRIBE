# Methodology

## Question and unit of evidence

NeuroSim compares a model’s response to condition A and B. It does not record human brains. A single pair of videos cannot establish a causal environmental effect or a population-level cognitive difference. Street vs park clips can differ in motion, luminance, sound levels, speech, social content, and camera behavior simultaneously.

Write a directional hypothesis first, choose anatomical ROIs in advance, match durations, and record nuisance factors. For research, build multiple matched stimulus pairs, compare model variants or modality ablations, then validate against independent human data. Automated ablation and multi-pair inference are future extensions, not implemented measurements.

## Prediction

The official TRIBE v2 adapter consumes multimodal events and returns an array of shape `(time, 20484)` and segment objects. Columns are fsaverage5 left hemisphere (10,242), followed by right hemisphere (10,242), following the official plotting implementation. The checkpoint’s average-subject behavior is retained.

The model’s upstream neuro configuration includes an offset of 5 seconds and a 1-second nominal sampling interval. We preserve each returned segment’s `start` and do not apply another shift. Predictions are aligned by the intersection of timestamps rounded to six decimal places, restricted to `[0, requested_duration)`. Missing or duplicate timestamps are not silently replaced by row positions. Fewer than three shared samples is an error.

Inputs are cropped before video/audio prediction. Text first follows upstream speech synthesis and transcription, then events are restricted to the requested window. No extra leading context is added, so short windows may exhibit boundary effects. Compare crop policies consistently and consider longer windows when validating.

## Aggregation and visualization

- **Surface map:** time mean at each vertex.
- **Contrast:** mean(A) − mean(B), with positive values favoring A.
- **Color range:** symmetric around zero; A and B share one range, while the contrast has its own range. Sulcal shading changes surface appearance. Numeric results are unaffected by view controls.
- **Display threshold:** hides low-magnitude colors; not a significance threshold.
- **ROIs:** 12 explicitly named bilateral anatomical regions from the Destrieux surface atlas. Pool left and right vertices with equal vertex weights. This is not surface-area weighting and does not estimate hemispheric asymmetry.
- **ROI time series:** vertex mean at each aligned timestamp; the selected row drives the chart and highlights that atlas label on the surface.
- **Spatial correlation:** Pearson r between the two vertex-wise temporal means, excluding Unknown and Medial_wall labels.
- **Temporal correlation:** Pearson r between the two ROI time series. Constant signals return null, displayed as a dash.
- **Units:** native model output. Do not label as percent BOLD change or a calibrated cognitive score.

Visual, auditory, attention-related, association, and motor filters are approximate functional associations for navigation, not a functional network atlas. Multiple regions are inspected descriptively without significance tests, confidence intervals, or population claims. Timepoints are autocorrelated and are not independent subjects.

## Provenance and retention

Each real result contains its source, requested configuration, source file SHA-256 hashes, resolved Hugging Face model commit, pinned TRIBE source commit, atlas, units, timestamp convention, and actual aligned sample count. Export JSON includes means and ROI series. The API’s NPZ endpoint contains full aligned vertex predictions. CSV includes source labels and units.

The fixture is mathematically constructed to illustrate controls. Its differences are invented, not outputs of TRIBE, measured data, or research findings. Changing the demo hypothesis does not test that hypothesis.
