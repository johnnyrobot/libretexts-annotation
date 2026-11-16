# Social annotation design and sources

This explains the supplied annotation implementation and its documented influences. Source documentation does not establish deployment on the institution's production host. [The user guide](USER-GUIDE.md) gives the operating steps.

The annotation interface and service use LibreTexts implementation. Hypothesis and Recogito were documented feature references. Helen Li's Nota Bene V2 thesis informed passage-centered discussion and instructor-workflow planning. The inspected annotation path does not import or call those applications. This is a bounded source-audit finding, not a forensic guarantee about every fragment in every repository.

## Source scope and implementation

The service is [libretexts-annotation](https://github.com/johnnyrobot/libretexts-annotation); the canonical integrated interface now lives under `reader/` in this same repository. The earlier UI source was maintained in [libretext-reader-web](https://github.com/johnnyrobot/libretext-reader-web). The source audit described below concerns backend `bb150704e20727116b6a65f1fc2941f9833bbeb4` and Reader `e3d47e004f88f0a40bd4c7faaf96205e595fdd40`. Later Reader commits `e3f209d0c214619bd8dfb9a8cff49e9569c5d7d3` and `678172d803f40e2e332dd6a6c766deec4bba821b` strengthen participation boundaries/reply indentation and remove a helper sentence. They introduce no external annotation library. The institution's current release manifest identifies one reviewed repository commit. The older source pins below document historical provenance, not a second current checkout requirement.

See [Deployment](DEPLOYMENT.md) for current instructions and [Architecture](ARCHITECTURE.md) for contracts and production-adoption limits.

## Why the reading remains the center

The design aims to reduce visual clutter and make participation controls easier to locate while preserving the textbook layout. The implementation retains the textbook's typography and identity. It adds annotation controls beside the reading rather than replacing the book with a separate chooser application.

The selected quote is prominent because a comment needs an unmistakable target. A deliberate Highlight or Discuss choice makes audience visible before a save. Optional notes and topics sit behind expandable controls so the initial task has fewer fields. The question composer has a named purpose, **Ask about this passage**, and one filled action. Secondary reply controls are outlined. These choices aim to make the next action and its target easier to identify; no cognitive-load reduction was measured.

Desktop uses a 26rem side panel. At 760px and below, the panel uses the bottom layout to preserve a portion of the source reading. Spacing and dividers separate thread starters. Participation sections use continuous leading rules, inner padding and named Passage context/Ask about this passage/Conversations headings. Account, view and refresh controls sit in a separate band between horizontal separators. Replies and reply composers have a clear single indent and connector, while text keeps the server's chronological order. The interface does not regroup by author or infer deeper reply ancestry.

Author names remain visible beside decorative initials. Four restrained accent colors supplement those names and may collide. They do not encode authority, correctness, unread state, or identity verification. Personal yellow and course pale-blue marks have a different purpose: distinguishing annotation audiences. Audience text and list controls remain necessary because color alone cannot carry that distinction.

The layout uses inherited type, consistent spacing, quiet metadata, and no decorative animation or nested card stacks. Visible focus and a keyboard passage chooser provide deliberate paths without pointer selection. Local checks covered contrast, forced colors, enlarged text/reflow, disabled controls, and focus recovery. These implementation checks are narrower than a full accessibility audit. VoiceOver testing has not been completed.

The current layout and embedding contract is in [Widget integration](WIDGET-INTEGRATION.md). Design/implementation workflows are development tools, not annotation runtime dependencies.

## Which ideas came from which projects

| Project or source | Role in our work | What was adopted in this release |
|---|---|---|
| Hypothesis | Documented feature reference for selected-text annotation, private highlights, sidebar discussion, tags/search, and visibility choices. | Interaction ideas adapted to our own private/course model. No inspected Hypothesis application import, service integration, or highlighting-engine adoption. |
| Recogito Studio | Comparative feature and architecture research for annotation scopes, layers, tags, and export. | Reference ideas. Studio itself was not deployed or incorporated into the inspected annotation path. |
| Recogito Text Annotator | Narrow candidate library evaluated for text ranges, overlap handling, mark visibility, and navigation. | Not adopted. Our mark renderer uses browser Range and the CSS Custom Highlight API with local anchor validation. |
| Helen Li's Nota Bene V2 thesis | Research motivation for discussion attached to readings, explicit interaction, and separate instructor triage needs. | Workflow inspiration. Proposed unread/live/notification features and assessed ADAPT artifacts are not part of this release. |
| `haystack/nb` | User-named comparative source containing NB service routes and course-management application code. | No code or runtime integration established by the scoped audit. The thesis does not identify this inspected commit as the evaluated implementation. |
| `haystack/nbclient` | Separate NB document annotator plugin and client components. | Relevant prior art. No import or documented adaptation lineage established. Similar highlights or connectors do not prove copying. |
| W3C Web Annotation and browser APIs | Shared standards and platform mechanisms. | Export vocabulary and native text-range rendering, implemented in LibreTexts code. Shared vocabulary does not imply shared application code. |
| Local LibreTexts design and implementation | Existing source contracts, privacy requirements, selection fixes, service receipts, and the user's focus request. | Exact anchoring, private persistence, account isolation, pending-save recovery, current author/focus presentation, and demo-name projection. |

These are documented feature/architecture references, not evidence of imported application code.

### Hypothesis has separate server and browser projects

[`hypothesis/h`](https://github.com/hypothesis/h/blob/9d116e407573d9cf8860643da30227b29a33b81d/README.md) is the service/API project. The [Hypothesis client README](https://github.com/hypothesis/client/blob/72526e9c8a671ec32cb3fe8c78f7e0082ab8016d/README.md) identifies the browser annotation client and its relationship to that service. Calling `h` the highlighting UI would conflate them. Our Reader uses its own annotation client and same-origin social-reading API.

### Recogito Studio and Text Annotator are separate choices

The [Studio distribution](https://github.com/recogito/recogito-studio/blob/f6335e1f75ad4f5e136b5c6836ab3b53e5601b64/README.md) connects application components. The [Text Annotator library](https://github.com/recogito/text-annotator-js/blob/0d375b0cba2bf68378f1f6dff30ee8812df95c0c/README.md) supplies embeddable text annotation. The older `text-annotator` repository address redirects to `text-annotator-js`. Researching the library did not install it in our application.

### `nb` and `nbclient` are not interchangeable

The inspected [`nb` package](https://github.com/haystack/nb/blob/ce4ef480e6ec3181711ae7f456f8e4f975438bcc/package.json) includes a Node service and Vue application. Its [annotation routes](https://github.com/haystack/nb/blob/ce4ef480e6ec3181711ae7f456f8e4f975438bcc/routes/annotations.js) handle discussion behavior. The [`nbclient` README](https://github.com/haystack/nbclient/blob/24f988ed17f3d26ea13c15b26b80ca80d01e4ed6/README.md) describes a document annotator plugin. Neither repository was adopted as our backend or client. Their relationship to the NB ecosystem does not establish that a specific upstream commit produced the thesis evaluation.

## What the source audit can establish

The prior bounded audit inspected the pinned Git objects, local import chain, manifests, lockfiles and available notices. It found no named upstream imports, service calls or package entries from the compared annotation applications in the inspected annotation path. This is not a whole-history or whole-Reader third-party clearance. The local rendering, API, persistence and anchor implementations provide the positive implementation trail.

The Reader's [annotation module](https://github.com/johnnyrobot/libretext-reader-web/blob/e3d47e004f88f0a40bd4c7faaf96205e595fdd40/src/annotations.mjs) imports local helpers. Its [mark renderer](https://github.com/johnnyrobot/libretext-reader-web/blob/e3d47e004f88f0a40bd4c7faaf96205e595fdd40/src/annotations/marks.mjs) handles validated ranges. The backend's [highlights module](../src/highlights.ts) provides owner-private records, authorized search, and export. [Store](../src/store.ts) provides course threads, replies, and receipts.

There is documented internal reuse between LibreTexts repositories: the [integration record](https://github.com/johnnyrobot/libretext-reader-web/blob/e3d47e004f88f0a40bd4c7faaf96205e595fdd40/docs/annotations-integration.md) traces the Reader's headless client and anchor helper to earlier social-reading commits. That is different from importing a named external application.

The backend declares `parse5` for source parsing. The wider Reader declares Hugging Face Transformers for its reading functions. Existing translation/audio vendor files belong to other functions. This attribution audit does not claim that the whole Reader has no third-party dependencies or that every third-party notice has been exhaustively cleared.

## Why exact anchors and explicit privacy matter

Personal highlights and course discussions have separate server-enforced audiences. Selecting a private highlight to discuss opens a fresh composer; it does not publish private note text. Server authorization also limits search, result counts, and export.

An anchor preserves the source revision, canonical passage, and exact selected range. Repeated text uses the selected occurrence. Changed or unsupported text is refused rather than matched approximately. Historical annotations are retained as stale when their source no longer matches. That choice prioritizes trustworthy attribution over silently moving a comment to plausible text.

Pending-save receipts distinguish an acknowledged write from an unknown network outcome. Recovery remains tied to the original account and request. These are LibreTexts implementation decisions, not benefits obtained automatically by copying another annotation UI.

## Export and licensing boundaries

Export uses [W3C Web Annotation](https://www.w3.org/TR/annotation-model/) concepts, including AnnotationPage, text bodies, and exact quote selectors. LibreTexts fields retain audience, revision, historical anchors, and range information. Block-relative UTF-16 offsets are not presented as page-wide text positions. Reply linkage uses a custom field. This is not a promise of a lossless generic importer or verified interchange with the named applications.

The [CSS Custom Highlight API](https://www.w3.org/TR/css-highlight-api-1/) is a browser standard used by our renderer. Standards use is distinct from copying an implementation that uses the same standard.

Upstream license files differ: [Hypothesis client](https://github.com/hypothesis/client/blob/72526e9c8a671ec32cb3fe8c78f7e0082ab8016d/LICENSE) includes BSD terms and separate component notices; [Recogito Studio](https://github.com/recogito/recogito-studio/blob/f6335e1f75ad4f5e136b5c6836ab3b53e5601b64/LICENSE) is AGPL-3.0; [Text Annotator](https://github.com/recogito/text-annotator-js/blob/0d375b0cba2bf68378f1f6dff30ee8812df95c0c/LICENSE) is BSD-3-Clause. The audit found no root license in the inspected `nb` scope; `nbclient` declares ISC in its manifest. These observations are not a blanket permission to copy code. The current evidence supports feature inspiration and our own implementation, not a third-party-code clearance or endorsement. Textbook rights remain separate from software licenses.

## What the thesis does and does not support

Helen Li's 2021 MIT MEng thesis, *Nota Bene V2: Understanding and Implementing Methods for Synchronous and Collaborative Learning*, motivates reading-linked interaction and instructor workflows. The original design research retained the supplied thesis PDF and page-level notes outside the source repositories. This document summarizes that prior research, not a new examination of the full thesis or proof that a named upstream Git commit produced its evaluated system.

The evaluation involved 40 students and one post-change week with two readings. Concurrency was encouraged through office hours. The comparison windows differed, and comments never read were excluded from latency calculations. Those conditions limit causal interpretation. Neither engagement, faster replies, nor this release's visual changes establish learning gains.

Unread state, quiet live replies, targeted notifications, presence, and ADAPT assignment/assessment integration remain separate planning work. Instructor-related backend concepts do not imply that their controls are exposed in the integrated Reader.

## Evidence and limits

The implementation has automated unit/API/browser checks and bounded rendered desktop/mobile, keyboard, forced-color and enlarged-text checks. These are functional implementation evidence, not evidence of educational gains. Manual VoiceOver has not been completed; whole-site accessibility and institutional assistive-technology acceptance remain separate. Audio/translation acceptance belongs to the institution's complete Reader deployment. The user guide's examples use synthetic discussions.
