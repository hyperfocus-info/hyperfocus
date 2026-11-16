# Sample uncertain proportions from images

Owner direction, 2026-11-07: when unsure of ratios while generating art, inspect
sample images and measure them before choosing proportions. Applies to characters,
animals, props, architecture and composition in game art and music films.

For native static image-to-3D reconstruction, use the
[enforced compiler and runtime path](../../../../apps/engine-editor/scripts/game-art/README.md#reference-driven-reconstruction).
The standalone sampler below remains useful for annotations and 2D work; its JSON
alone does not install project constraints. Keep source-camera appearance targets
separate from constraints on geometry and from designed unseen surfaces.

Use the owner's supplied or scoped approved examples first, including an older
preferred render. If they do not resolve the geometry, find and actually inspect
relevant photographs, model sheets or frames. Match subject, style, view and pose.
A search thumbnail, textual description or another unverified generated image is
not anatomical evidence. Separate references for appearance, anatomy and pose;
an approved stylized cover can guide composition without proving realistic anatomy.

## Inspect, measure, build, compare

1. Name the uncertain relationship: head/body, upper/lower arm, bird/hand, prop/grip,
   doorway/person or subject/frame. Inspect enough views to resolve it. Do not
   average different characters, ages, styles or incompatible camera views.
2. Save the source URL/path, exact image/frame and crop, dimensions and view/pose.
   Mark visible landmarks on the inspected image. Record pixel coordinates and
   uncertainty; do not invent hidden joints. Work in original pixel coordinates
   or one uniformly resized image. Independent X/Y normalization distorts lengths.
3. Compute dimensionless ratios from named segments. Use the
   [reference sampler](../../../../scripts/game-art/README.md#sample-image-proportions)
   to retain landmarks, uncertainty intervals and source hashes. Measurements in
   a perspective image are projected ratios, not physical bone lengths. Obtain a
   suitable second view or calibrated source when foreshortening changes the answer.
4. Put the selected ratios/ranges in the owning asset recipe or generator parameters,
   with a source and reason for deliberate stylization. Reuse the established rig
   or asset when it already preserves them. Do not leave measurements only in prose
   while independently guessing the production constants.
5. Render a cheap silhouette/blockout with matched pose, projection and framing.
   Compare the same landmarks, relative sizes, negative spaces and support/contact
   points with the source. Use a side-by-side or registered overlay; align translation
   and uniform scale only, since stretching can hide proportion errors. Repair the
   large relationships before detail, effects or full-length rendering.

Keep the source image, annotations, measurement receipt, selected parameter mapping
and matched candidate capture in the production evidence directory. Set comparison
tolerances from landmark ambiguity and intended stylization before judging the
candidate; do not widen them to pass a miss. No universal human head count or fixed
percentage applies across styles. Preserve scoped accepted features across revisions.

## Ratios do not certify posing or motion

An arm with correct lengths can still bend the wrong way. Sample shoulder, elbow
and wrist placement, bend direction, hand orientation and negative space for the
specific action; check these in the rig's coordinate frame. Reach, attachment,
support and collision remain separate constraints. For movement, inspect reference
frames across anticipation, contact, follow-through and recovery plus real-time
playback. A still-image ratio does not prove continuity or acting quality.

If a useful source or landmark is unavailable, label the estimate and keep that
quality unresolved. Ask for a concrete comparison only for missing material taste;
technical measurement is the agent's work. Sampled proportions establish a bounded
construction reference, not owner approval or a quality score.
