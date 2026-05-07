import './styles.css'
import { analyzeQr, explainMaskAt } from './qr-analysis.js'
import FormatInfo from 'qrcode/lib/core/format-info.js'

const SAMPLE_TEXT = 'https://rakshithnettar.com'

const SEGMENT_COLORS = [
  '#ff5d73',
  '#2ec4b6',
  '#ff9f1c',
  '#4361ee',
  '#8338ec',
  '#06d6a0'
]

const BLOCK_COLORS = [
  '#ff6b6b',
  '#3a86ff',
  '#ffbe0b',
  '#00b894',
  '#fb5607',
  '#9b5de5',
  '#06b6d4',
  '#ef476f'
]

const FOCUS_COLORS = {
  finder: '#ff5d73',
  separator: '#ffd6a5',
  timing: '#0ead69',
  alignment: '#ffb703',
  format: '#4cc9f0',
  version: '#8b5cf6',
  'dark-module': '#111827',
  mode: '#ff7b00',
  count: '#ffd166',
  payload: '#2ec4b6',
  terminator: '#76c893',
  'byte-align': '#90e0ef',
  pad: '#98a2b3',
  'error-correction': '#f72585',
  remainder: '#b6bccb'
}

const FOCUS_LABELS = {
  finder: 'Finder',
  separator: 'Separator',
  timing: 'Timing',
  alignment: 'Alignment',
  format: 'Format',
  version: 'Version',
  'dark-module': 'Dark Module',
  mode: 'Mode Bits',
  count: 'Count Bits',
  payload: 'Payload Bits',
  terminator: 'Terminator',
  'byte-align': 'Byte Align',
  pad: 'Pad Bytes',
  'error-correction': 'Error Correction',
  remainder: 'Remainder'
}

const FOCUS_ORDER = [
  'finder',
  'separator',
  'timing',
  'alignment',
  'format',
  'version',
  'dark-module',
  'mode',
  'count',
  'payload',
  'terminator',
  'byte-align',
  'pad',
  'error-correction',
  'remainder'
]

const FOCUS_ORDER_INDEX = new Map(FOCUS_ORDER.map((key, index) => [key, index]))
const ANIMATION_TICK_MS = 24

const app = document.querySelector('#app')

const state = {
  text: SAMPLE_TEXT,
  errorCorrectionLevel: 'M',
  overlayMode: 'structure',
  maskDetailPattern: null,
  activeSelection: null,
  hoveredModuleKey: null,
  animation: {
    running: false,
    progress: 0,
    timerId: null
  },
  analysis: null,
  error: null
}

app.innerHTML = `
  <div class="site-shell">
    <div class="announcement-bar">
      <div class="announcement-inner">
        <p>Interactive QR Reader lets you generate a live QR code and inspect every segment, block, and mask in one place.</p>
        <a href="#workbench">Learn more</a>
      </div>
    </div>

    <header class="global-nav">
      <div class="global-nav-inner">
        <a class="global-mark" href="#overview" aria-label="Interactive QR Reader home">Interactive QR Reader</a>
        <nav class="global-nav-links" aria-label="Global navigation">
          <a href="#overview">Overview</a>
          <a href="#workbench">Workbench</a>
          <a href="#inspect">Inspect</a>
          <a href="#reed-solomon">Error correction</a>
          <a href="#masking">Masking</a>
          <a href="#read-more">Resources</a>
        </nav>
        <div class="global-nav-actions">
          <a class="nav-utility-link" href="https://blog.rakshithnettar.com/building-an-interactive-qr-code-reader-that-explains-itself/" target="_blank" rel="noreferrer">Write-up</a>
          <a class="button-primary button-primary-nav" href="#workbench">Open reader</a>
        </div>
      </div>
    </header>

    <main>
      <section class="hero-section" id="overview">
        <div class="container hero-shell">
          <div class="hero-copy">
            <p class="eyebrow">Learn QR Code Logic</p>
            <h1>Understand how a QR code works.</h1>
            <p class="lede">
              Generate a live QR code, follow the encoded bitstream into the matrix, and
              learn how structure, placement, blocks, and masking fit together.
            </p>
            <div class="hero-actions">
              <a class="button-primary" href="#workbench">Start learning</a>
              <a class="button-secondary-pill" href="#read-more">Read the series</a>
            </div>
          </div>

          <div class="hero-media-grid">
            <article class="hero-photo-card hero-photo-card-wide">
              <div class="media-card-top">
                <span class="mono-label">QR pipeline</span>
                <span class="button-pill-outline">Interactive explainer</span>
              </div>
              <div class="hero-photo-visual">
                <div class="hero-visual-column">
                  <span class="visual-label">Input</span>
                  <strong>Text to bitstream</strong>
                  <p>Mode, count, payload, padding, and error correction stay visible step by step.</p>
                </div>
                <div class="hero-visual-divider"></div>
                <div class="hero-visual-column">
                  <span class="visual-label">Output</span>
                  <strong>Bitstream to matrix</strong>
                  <p>Placement order, structure overlays, and mask scoring update as the symbol is built.</p>
                </div>
              </div>
            </article>

            <article class="agent-console-card hero-console-card">
              <div class="media-card-top media-card-top-dark">
                <span class="mono-label mono-label-dark">Live summary</span>
                <span class="console-status">Live</span>
              </div>
              <div id="statusPanel" class="status-panel"></div>
              <section class="summary-grid" id="summaryGrid"></section>
            </article>
          </div>
        </div>
      </section>

      <section class="section-shell section-shell-dark" id="workbench">
        <div class="container">
          <div class="section-heading section-heading-on-dark">
            <p class="eyebrow">Workbench</p>
            <h2>Build the QR step by step.</h2>
            <p class="section-copy">
              Adjust the payload, change error correction, and switch overlays while the
              live QR symbol and module map stay synchronized.
            </p>
          </div>

          <div class="workbench-grid">
            <article class="panel contact-form-card controls-panel">
              <div class="panel-head">
                <div>
                  <p class="eyebrow">Input</p>
                  <h3>Payload and controls</h3>
                </div>
                <button id="clearFocusButton" class="ghost-button" type="button">Clear focus</button>
              </div>

              <label class="field">
                <span>Text</span>
                <textarea id="textInput" rows="5" maxlength="160" spellcheck="false"></textarea>
              </label>

              <div class="control-strip">
                <label class="field compact">
                  <span>Error correction</span>
                  <select id="eccSelect">
                    <option value="L">L · low</option>
                    <option value="M">M · medium</option>
                    <option value="Q">Q · quartile</option>
                    <option value="H">H · high</option>
                  </select>
                </label>

                <div class="field compact">
                  <span>Overlay mode</span>
                  <div id="overlayModes" class="mode-switch">
                    <button type="button" data-mode="structure">Structure</button>
                    <button type="button" data-mode="segments">Segments</button>
                    <button type="button" data-mode="blocks">Blocks</button>
                  </div>
                </div>
              </div>
            </article>

            <article class="panel hero-photo-card viewer-panel">
              <div class="panel-head">
                <div>
                  <p class="eyebrow">Scan-ready</p>
                  <h3>Live QR code</h3>
                </div>
              </div>
              <div class="canvas-frame">
                <canvas id="scanCanvas"></canvas>
              </div>
              <p class="hint">
                The symbol preserves quiet-zone spacing and contrast so the live output remains scannable.
              </p>
            </article>

            <article class="panel agent-console-card viewer-panel viewer-panel-wide">
              <div class="panel-head">
                <div>
                  <p class="eyebrow">Exploded view</p>
                  <h3>Interactive module map</h3>
                </div>
                <div class="panel-actions">
                  <button id="animateButton" class="ghost-button" type="button">Animate fill</button>
                  <button id="singleStepButton" class="ghost-button" type="button">Single step</button>
                  <button id="groupStepButton" class="ghost-button" type="button">Group step</button>
                </div>
              </div>
              <div id="matrixShell" class="matrix-shell"></div>
              <p class="hint">
                Hover or pin a cell. With nothing selected, every writable module shows its placement order.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section class="section-shell section-shell-light" id="inspect">
        <div class="container">
          <div class="section-heading">
            <p class="eyebrow">Inspect</p>
            <h2>Decode the symbol in layers.</h2>
            <p class="section-copy">
              Move from structural groups to encoded chunks, block splits, and module-level
              explanations without losing the current matrix context.
            </p>
            <p class="section-copy">
              Click any group below, then check the Selected detail panel for a deeper explanation.
            </p>
          </div>

          <section class="details-grid">
            <article class="panel capability-card utility-card-wide">
              <div class="panel-head">
                <div>
                  <p class="eyebrow">Legend</p>
                  <h3>QR groups</h3>
                </div>
              </div>
              <div id="legendPanel" class="token-grid"></div>
            </article>

            <article class="panel capability-card">
              <div class="panel-head">
                <div>
                  <p class="eyebrow">Step 1</p>
                  <h3>Segments</h3>
                </div>
              </div>
              <div id="segmentsPanel" class="stack-list"></div>
            </article>

            <article class="panel capability-card">
              <div class="panel-head">
                <div>
                  <p class="eyebrow">Step 2</p>
                  <h3>Payload Groups</h3>
                </div>
              </div>
              <div id="payloadGroupsPanel" class="stack-list"></div>
            </article>

            <article class="panel capability-card">
              <div class="panel-head">
                <div>
                  <p class="eyebrow">Step 3</p>
                  <h3>Blocks</h3>
                </div>
              </div>
              <div id="blocksPanel" class="stack-list"></div>
            </article>

            <article class="panel capability-card">
              <div class="panel-head">
                <div>
                  <p class="eyebrow">Step 4</p>
                  <h3>Selected detail</h3>
                </div>
              </div>
              <div id="inspectorPanel" class="inspector"></div>
            </article>
          </section>
        </div>
      </section>

      <section class="section-shell section-shell-stone" id="reed-solomon">
        <div class="container">
          <div class="section-heading">
            <p class="eyebrow">Reed-Solomon</p>
            <h2>See how parity bytes protect the payload.</h2>
            <p class="section-copy">
              After the data bytes are assembled, QR splits them into blocks and generates
              Reed-Solomon parity for each block before placement and masking begin.
            </p>
          </div>

          <section id="reedSolomonPanel" class="rs-grid"></section>
        </div>
      </section>

      <section class="section-shell section-shell-pale" id="masking">
        <div class="container">
          <div class="section-heading">
            <p class="eyebrow">Masking</p>
            <h2>Audit every candidate rule.</h2>
            <p class="section-copy">
              Compare the eight QR mask formulas, inspect each penalty category, and see
              how the chosen pattern minimizes structure-like noise in the final symbol.
            </p>
          </div>

          <section class="panel dark-feature-band masking-panel">
            <div class="panel-head">
              <div>
                <p class="eyebrow">Step 5</p>
                <h3>Mask selection</h3>
              </div>
            </div>
            <div id="maskingPanel" class="mask-grid"></div>
          </section>
        </div>
      </section>
    </main>

    <footer class="site-footer" id="read-more">
      <div class="container footer-inner">
        <div class="footer-newsletter">
          <div class="footer-newsletter-copy">
            <p class="footer-kicker">Keep learning</p>
            <h2>Continue through the full QR explainer series.</h2>
            <p>
              Start with the interactive reader write-up, then go deeper into building
              blocks, placement, Reed-Solomon error correction, and masking.
            </p>
          </div>
          <a
            class="footer-newsletter-action"
            href="https://blog.rakshithnettar.com/read-qr-code-by-logic-part-1-the-building-blocks/"
            target="_blank"
            rel="noreferrer"
          >
            <span>Read the QR series</span>
            <span>→</span>
          </a>
        </div>

        <div class="footer-columns">
          <div class="footer-column">
            <p class="footer-heading">Guide</p>
            <div class="footer-link-list">
              <a class="footer-text-link" href="https://blog.rakshithnettar.com/building-an-interactive-qr-code-reader-that-explains-itself/" target="_blank" rel="noreferrer">Interactive QR reader write-up</a>
              <a class="footer-text-link" href="#workbench">Open the workbench</a>
              <a class="footer-text-link" href="#inspect">Inspect groups and blocks</a>
            </div>
          </div>

          <div class="footer-column">
            <p class="footer-heading">Series</p>
            <div class="footer-link-list">
              <a class="footer-text-link" href="https://blog.rakshithnettar.com/read-qr-code-by-logic-part-1-the-building-blocks/" target="_blank" rel="noreferrer">Part 1: Building blocks</a>
              <a class="footer-text-link" href="https://blog.rakshithnettar.com/read-qr-code-by-logic-part-2-payload-groups-placement-and-pad-bytes/" target="_blank" rel="noreferrer">Part 2: Payload, placement, and pad bytes</a>
              <a class="footer-text-link" href="https://blog.rakshithnettar.com/read-qr-code-by-logic-part-3-reed-solomon-error-correction/" target="_blank" rel="noreferrer">Part 3: Error correction</a>
            </div>
          </div>

          <div class="footer-column">
            <p class="footer-heading">More</p>
            <div class="footer-link-list">
              <a class="footer-text-link" href="https://blog.rakshithnettar.com/read-qr-code-by-logic-part-4-masking-the-matrix/" target="_blank" rel="noreferrer">Part 4: Masking</a>
              <a class="footer-text-link" href="https://blog.rakshithnettar.com/read-qr-code-by-logic-part-5-the-other-qr-groups/" target="_blank" rel="noreferrer">Part 5: Other QR groups</a>
              <a class="footer-text-link" href="https://rakshithnettar.com" target="_blank" rel="noreferrer">rakshithnettar.com</a>
            </div>
          </div>
        </div>

        <div class="footer-legal">
          <span>Built as an interactive explainer for how QR symbols are assembled.</span>
          <span>QR Code is a registered trademark of DENSO WAVE INCORPORATED.</span>
        </div>
      </div>
    </footer>
  </div>
`

const textInput = document.querySelector('#textInput')
const eccSelect = document.querySelector('#eccSelect')
const overlayModes = document.querySelector('#overlayModes')
const animateButton = document.querySelector('#animateButton')
const singleStepButton = document.querySelector('#singleStepButton')
const groupStepButton = document.querySelector('#groupStepButton')
const clearFocusButton = document.querySelector('#clearFocusButton')
const statusPanel = document.querySelector('#statusPanel')
const summaryGrid = document.querySelector('#summaryGrid')
const scanCanvas = document.querySelector('#scanCanvas')
const matrixShell = document.querySelector('#matrixShell')
const reedSolomonPanel = document.querySelector('#reedSolomonPanel')
const maskingPanel = document.querySelector('#maskingPanel')
const legendPanel = document.querySelector('#legendPanel')
const segmentsPanel = document.querySelector('#segmentsPanel')
const payloadGroupsPanel = document.querySelector('#payloadGroupsPanel')
const blocksPanel = document.querySelector('#blocksPanel')
const inspectorPanel = document.querySelector('#inspectorPanel')

textInput.value = state.text
eccSelect.value = state.errorCorrectionLevel

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function mixHex(colorA, colorB, ratio) {
  const a = colorA.replace('#', '')
  const b = colorB.replace('#', '')
  const result = [0, 2, 4].map((offset) => {
    const valueA = Number.parseInt(a.slice(offset, offset + 2), 16)
    const valueB = Number.parseInt(b.slice(offset, offset + 2), 16)
    const mixed = Math.round(valueA * (1 - ratio) + valueB * ratio)
    return mixed.toString(16).padStart(2, '0')
  }).join('')

  return `#${result}`
}

function getSegmentColor(index) {
  return SEGMENT_COLORS[index % SEGMENT_COLORS.length]
}

function getBlockColor(index) {
  return BLOCK_COLORS[index % BLOCK_COLORS.length]
}

function setSelection(selection) {
  state.activeSelection = selection
  render()
}

function isSelectionActive(type, id) {
  return state.activeSelection?.type === type && String(state.activeSelection.id) === String(id)
}

function findModule(key) {
  return state.analysis?.modules.find((module) => module.key === key) || null
}

function matchesSelection(module, selection) {
  if (!selection) return false
  if (selection.type === 'module') return module.key === selection.id
  if (selection.type === 'segment') return module.source?.segmentId === selection.id
  if (selection.type === 'chunk') {
    const group = getPayloadGroupById(selection.id)
    return Boolean(
      group &&
      module.source?.segmentId === group.segmentId &&
      module.source?.chunkIndex === group.chunkIndex
    )
  }
  if (selection.type === 'block') return module.blockId === selection.id
  if (selection.type === 'focus') return module.focusKey === selection.id
  return false
}

function getSelectedModule() {
  if (state.activeSelection?.type === 'module') {
    return findModule(state.activeSelection.id)
  }

  if (state.hoveredModuleKey) {
    return findModule(state.hoveredModuleKey)
  }

  return null
}

function getBlockById(id) {
  return state.analysis?.blocks.find((block) => block.id === id) || null
}

function getSegmentById(id) {
  return state.analysis?.segments.find((segment) => segment.id === id) || null
}

function getChunkSelectionId(segmentId, chunkIndex) {
  return `${segmentId}:${chunkIndex}`
}

function formatHexByte(value) {
  return `0x${Number(value).toString(16).padStart(2, '0').toUpperCase()}`
}

function getPayloadGroups() {
  if (!state.analysis) return []

  return state.analysis.segments.flatMap((segment) => (
    segment.chunks.map((chunk) => ({
      id: getChunkSelectionId(segment.id, chunk.index),
      segmentId: segment.id,
      segmentMode: segment.mode,
      segmentText: segment.text,
      segmentLength: segment.length,
      chunkIndex: chunk.index,
      label: chunk.label,
      kind: chunk.kind,
      modeLabel: chunk.modeLabel,
      bitLength: chunk.bitLength,
      encodedValue: chunk.encodedValue,
      bits: chunk.bits,
      encodingSummary: chunk.encodingSummary,
      moduleCount: chunk.moduleCount,
      startBit: chunk.startBit,
      endBit: chunk.endBit
    }))
  ))
}

function getPayloadGroupById(id) {
  return getPayloadGroups().find((group) => group.id === id) || null
}

function getMaskCandidateByPattern(pattern) {
  return state.analysis?.masking.candidates.find((candidate) => candidate.pattern === pattern) || null
}

function getFocusColor(module) {
  const focusKey = module.focusKey
  return FOCUS_COLORS[focusKey] || '#475467'
}

function getModuleBaseColor(module) {
  if (state.overlayMode === 'segments' && module.source?.segmentId != null) {
    return getSegmentColor(module.source.segmentId)
  }

  if (state.overlayMode === 'blocks' && module.blockId != null) {
    return getBlockColor(module.blockId)
  }

  return getFocusColor(module)
}

function getModuleVisual(module) {
  const baseColor = getModuleBaseColor(module)
  const selectedModule = state.activeSelection?.type === 'module' ? state.activeSelection.id : null
  const activeSelection = state.activeSelection && state.activeSelection.type !== 'module'
    ? state.activeSelection
    : null
  const isActive = activeSelection ? matchesSelection(module, activeSelection) : false
  const isPinned = selectedModule === module.key
  const isHovered = state.hoveredModuleKey === module.key

  let fill = module.isDark ? baseColor : mixHex(baseColor, '#fff7ed', 0.82)
  let opacity = 1

  if (activeSelection && !isActive) {
    fill = module.isDark ? mixHex(baseColor, '#f8fafc', 0.86) : '#f8fafc'
    opacity = 0.42
  }

  if (module.category === 'separator' && !module.isDark) {
    fill = mixHex(baseColor, '#fffdf8', 0.55)
  }

  const stroke = isPinned ? '#020617' : (isHovered ? '#1d4ed8' : 'none')
  const strokeWidth = isPinned ? 0.22 : (isHovered ? 0.12 : 0)

  return {
    fill,
    opacity,
    stroke,
    strokeWidth
  }
}

function describeFocus(module) {
  return FOCUS_LABELS[module.focusKey] || 'Data'
}

function getModulePlacementValue(module) {
  if (module.placementIndex != null) {
    return module.placementIndex
  }

  if (module.codewordIndex != null && module.bitIndexInCodeword != null) {
    return module.codewordIndex * 8 + module.bitIndexInCodeword
  }

  return state.analysis.size * state.analysis.size * 8 + module.row * state.analysis.size + module.col
}

function getFinalBit(module) {
  return module.isDark ? 1 : 0
}

function getPlacementOrderedModules() {
  if (!state.analysis) return []

  return state.analysis.modules
    .filter((module) => module.placementIndex != null)
    .sort((left, right) => left.placementIndex - right.placementIndex)
}

function getAnimationSequence() {
  if (!state.analysis) return []

  return [...state.analysis.modules].sort((left, right) => {
    const leftGroup = FOCUS_ORDER_INDEX.get(left.focusKey) ?? FOCUS_ORDER.length
    const rightGroup = FOCUS_ORDER_INDEX.get(right.focusKey) ?? FOCUS_ORDER.length
    if (leftGroup !== rightGroup) return leftGroup - rightGroup

    const leftPlacement = getModulePlacementValue(left)
    const rightPlacement = getModulePlacementValue(right)
    if (leftPlacement !== rightPlacement) return leftPlacement - rightPlacement

    const rowDelta = left.row - right.row
    if (rowDelta !== 0) return rowDelta

    return left.col - right.col
  })
}

function getAnimationPlan() {
  const sequence = getAnimationSequence()
  const indexByKey = new Map(sequence.map((module, index) => [module.key, index]))
  const total = sequence.length
  const progress = Math.min(Math.max(state.animation.progress, 0), total)
  const currentIndex = progress > 0 ? progress - 1 : null
  const currentModule = currentIndex != null ? sequence[currentIndex] || null : null
  const currentLabel = currentModule ? (FOCUS_LABELS[currentModule.focusKey] || describeFocus(currentModule)) : null

  return {
    sequence,
    indexByKey,
    total,
    progress,
    currentModule,
    currentLabel,
    completed: total > 0 && progress >= total
  }
}

function updateAnimationButtons() {
  if (animateButton) {
    const plan = getAnimationPlan()
    const hasProgress = plan.progress > 0

    animateButton.textContent = state.animation.running
      ? 'Pause fill'
      : plan.completed
        ? 'Replay fill'
        : hasProgress
          ? 'Resume fill'
          : 'Animate fill'
    animateButton.classList.toggle('is-active', state.animation.running)
    animateButton.setAttribute('aria-pressed', String(state.animation.running))
    animateButton.disabled = !state.analysis
  }

  if (singleStepButton) {
    singleStepButton.disabled = !state.analysis
  }

  if (groupStepButton) {
    groupStepButton.disabled = !state.analysis
  }
}

function stopAnimation({ reset = false } = {}) {
  if (state.animation.timerId != null) {
    window.clearInterval(state.animation.timerId)
    state.animation.timerId = null
  }

  state.animation.running = false

  if (reset) {
    state.animation.progress = 0
  }

  updateAnimationButtons()
}

function renderAnimationUi() {
  updateAnimationButtons()
  renderStatus()
}

function advanceSingleStep() {
  if (!state.analysis) return

  if (state.animation.running) {
    stopAnimation()
  }

  const plan = getAnimationPlan()
  if (!plan.total) return

  if (plan.completed) {
    state.animation.progress = 0
  }

  state.animation.progress = Math.min(state.animation.progress + 1, plan.total)
  renderMatrix()
  renderAnimationUi()

  if (state.animation.progress >= plan.total) {
    stopAnimation()
    renderAnimationUi()
  }
}

function advanceGroupStep() {
  if (!state.analysis) return

  if (state.animation.running) {
    stopAnimation()
  }

  const plan = getAnimationPlan()
  if (!plan.total) return

  if (plan.completed) {
    state.animation.progress = 0
  }

  const currentProgress = state.animation.progress
  if (currentProgress >= plan.total) {
    state.animation.progress = 0
  }

  const startIndex = state.animation.progress
  const nextModule = plan.sequence[startIndex]
  if (!nextModule) return

  const targetGroupKey = nextModule.focusKey
  let targetProgress = startIndex

  while (targetProgress < plan.total) {
    const module = plan.sequence[targetProgress]
    if (module.focusKey !== targetGroupKey) {
      break
    }
    targetProgress += 1
  }

  state.animation.progress = Math.min(targetProgress, plan.total)
  renderMatrix()
  renderAnimationUi()

  if (state.animation.progress >= plan.total) {
    stopAnimation()
    renderAnimationUi()
  }
}

function stepAnimation() {
  const plan = getAnimationPlan()
  if (!plan.total) {
    stopAnimation({ reset: true })
    return
  }

  if (state.animation.progress >= plan.total) {
    stopAnimation()
    renderAnimationUi()
    return
  }

  state.animation.progress += 1
  renderMatrix()
  renderAnimationUi()

  if (state.animation.progress >= plan.total) {
    stopAnimation()
    renderAnimationUi()
  }
}

function startAnimation() {
  const plan = getAnimationPlan()
  if (!plan.total) return

  if (plan.completed) {
    state.animation.progress = 0
  }

  if (state.animation.progress === 0) {
    state.animation.progress = 1
  }

  if (state.animation.running) return

  if (state.animation.timerId != null) {
    window.clearInterval(state.animation.timerId)
  }

  state.animation.running = true
  state.animation.timerId = window.setInterval(stepAnimation, ANIMATION_TICK_MS)
  renderMatrix()
  renderAnimationUi()

  if (state.animation.progress >= plan.total) {
    stopAnimation()
    renderAnimationUi()
  }
}

function toggleAnimation() {
  if (!state.analysis) return

  if (state.animation.running) {
    stopAnimation()
    renderAnimationUi()
    return
  }

  startAnimation()
}

function getOrderedModulesForSelection(selection) {
  if (!state.analysis || !selection) return []

  return state.analysis.modules
    .filter((module) => matchesSelection(module, selection))
    .sort((left, right) => {
      const placementDelta = getModulePlacementValue(left) - getModulePlacementValue(right)
      if (placementDelta !== 0) return placementDelta

      const rowDelta = left.row - right.row
      if (rowDelta !== 0) return rowDelta

      return left.col - right.col
    })
}

function shouldShowPlacementLabels(selection, modules) {
  if (!selection || selection.type === 'module' || modules.length === 0) return false

  if (selection.type === 'chunk') {
    return modules.length <= 18
  }

  if (selection.type === 'focus') {
    if (['count', 'mode', 'format', 'version', 'terminator', 'byte-align', 'pad', 'remainder', 'dark-module'].includes(selection.id)) {
      return modules.length <= 40
    }

    return modules.length <= 18
  }

  return modules.length <= 28
}

function shouldShowDetailedBitLabels(selection, modules) {
  if (!selection || modules.length === 0) return false
  if (modules.some((module) => module.rawValue == null || module.maskBit == null)) return false

  if (selection.type === 'chunk') {
    return modules.length <= 12
  }

  if (selection.type !== 'focus') return false

  return ['count', 'mode', 'terminator', 'byte-align', 'pad'].includes(selection.id) && modules.length <= 16
}

function getActiveMatrixOverlay() {
  if (!state.analysis) {
    return {
      placementLabels: new Map(),
      bitTriplets: new Map(),
      selectedCount: 0,
      hasDetailedBits: false
    }
  }

  if (!state.activeSelection) {
    const allPlacedModules = getPlacementOrderedModules()
    return {
      placementLabels: new Map(allPlacedModules.map((module, index) => [module.key, String(index + 1)])),
      bitTriplets: new Map(),
      selectedCount: allPlacedModules.length,
      hasDetailedBits: false
    }
  }

  const selection = state.activeSelection
  const selectedModules = getOrderedModulesForSelection(selection)

  if (!shouldShowPlacementLabels(selection, selectedModules)) {
    return {
      placementLabels: new Map(),
      bitTriplets: new Map(),
      selectedCount: selectedModules.length,
      hasDetailedBits: false
    }
  }

  const placementLabels = new Map(selectedModules.map((module, index) => [module.key, String(index + 1)]))
  const hasDetailedBits = shouldShowDetailedBitLabels(selection, selectedModules)
  const bitTriplets = hasDetailedBits
    ? new Map(selectedModules.map((module) => [module.key, `${module.rawValue}/${module.maskBit}/${getFinalBit(module)}`]))
    : new Map()

  return {
    placementLabels,
    bitTriplets,
    selectedCount: selectedModules.length,
    hasDetailedBits
  }
}

function getPlacementMarkerInterval(total) {
  if (total <= 120) return 12
  if (total <= 260) return 18
  return Math.max(24, Math.ceil(total / 14))
}

function getModuleBitLabel(module) {
  if (module.bitIndexInCodeword == null) return '—'
  return `${module.bitIndexInCodeword + 1} of 8`
}

function getSegmentChunk(module, segment) {
  if (!segment || module.source?.chunkIndex == null) return null
  return segment.chunks.find((chunk) => chunk.index === module.source.chunkIndex) || null
}

function getChunkKindLabel(chunk) {
  switch (chunk?.kind) {
    case 'alphanumeric-group':
      return 'Alphanumeric pair'
    case 'numeric-group':
      return 'Numeric group'
    case 'byte':
      return 'Byte'
    default:
      return 'Payload group'
  }
}

function getMaskSummary(module) {
  if (module.rawValue == null) {
    return 'Function modules are fixed by the QR layout, so they are not part of the masked data stream.'
  }

  if (module.focusKey === 'remainder') {
    return 'Remainder cells are outside the codeword stream, so the mask does not change any meaningful payload bit here.'
  }

  return module.flippedByMask
    ? `The raw bit was ${module.rawValue}. Mask pattern ${state.analysis.maskPattern} flipped it, so the final visible bit became ${getFinalBit(module)}.`
    : `The raw bit was ${module.rawValue}. Mask pattern ${state.analysis.maskPattern} left it unchanged, so the final visible bit stayed ${getFinalBit(module)}.`
}

function getMaskFormulaSummary(module) {
  if (module.rawValue == null) {
    return 'Reserved function modules are excluded from masking, so their visible value is fixed directly by the QR layout.'
  }

  if (module.focusKey === 'remainder') {
    return 'Remainder cells are outside the payload and error-correction stream, so there is no meaningful mask decision to explain here.'
  }

  const explanation = explainMaskAt(state.analysis.maskPattern, module.row, module.col)
  return `${explanation.label}: ${explanation.formula}. For this cell: ${explanation.evaluation}.`
}

function getFinalBitSummary(module) {
  if (module.rawValue == null) {
    return `This is a fixed structural module, so the final visible bit is ${getFinalBit(module)} without any XOR masking step.`
  }

  if (module.focusKey === 'remainder') {
    return `This remainder cell ends up as ${getFinalBit(module)} and is not tied to a meaningful payload XOR step.`
  }

  return `${module.rawValue} XOR ${module.maskBit} = ${getFinalBit(module)}.`
}

function getPlacementSlotLabel(module) {
  return module.placementIndex != null ? `#${module.placementIndex}` : 'Skipped'
}

function getPlacementSummary(module) {
  if (module.rawValue == null) {
    return 'This cell belongs to a reserved function area. Reserved positions are fixed before data placement begins, so the zig-zag walk skips this row and column location entirely and bends around it.'
  }

  if (module.focusKey === 'remainder') {
    return `This cell is placement ${getPlacementSlotLabel(module)} in the full zig-zag walk. After all data and error-correction codewords are placed, a few versions still have leftover cells; those become remainder bits and are not tied to any block.`
  }

  return `This cell is placement ${getPlacementSlotLabel(module)} in the full zig-zag walk. After reserving function patterns, the encoder starts at the bottom-right open cell, moves in two-column stripes, and reverses at the top or bottom edge. When the walk reached row ${module.row}, col ${module.col}, it wrote ${getModuleBitLabel(module)} of codeword #${module.codewordIndex}.`
}

function getLengthUnitLabel(segment) {
  if (!segment) return 'units'

  switch (segment.mode) {
    case 'Numeric':
      return 'digits'
    case 'Alphanumeric':
      return 'characters'
    case 'Byte':
      return 'bytes'
    case 'Kanji':
      return 'characters'
    default:
      return 'units'
  }
}

function getPaddingContextInfo(module) {
  if (!state.analysis) return null

  const {
    segmentBits,
    terminatorBits,
    alignmentBits,
    padBytes,
    dataCapacityBits
  } = state.analysis.stats

  if (module.focusKey === 'terminator') {
    return {
      title: 'Padding Context',
      body: `After the real payload ended at ${segmentBits} bits, the encoder added up to 4 trailing zero terminator bits. This QR used ${terminatorBits} terminator bit${terminatorBits === 1 ? '' : 's'}, then ${alignmentBits} byte-alignment zero bit${alignmentBits === 1 ? '' : 's'}, then ${padBytes} alternating pad byte${padBytes === 1 ? '' : 's'} until the ${dataCapacityBits}-bit data capacity was full.`
    }
  }

  if (module.focusKey === 'byte-align') {
    return {
      title: 'Padding Context',
      body: `QR payloads must be split into whole bytes before block processing. After ${terminatorBits} terminator bit${terminatorBits === 1 ? '' : 's'}, this QR added ${alignmentBits} zero bit${alignmentBits === 1 ? '' : 's'} to reach the next 8-bit boundary, then appended ${padBytes} alternating pad byte${padBytes === 1 ? '' : 's'} if space still remained.`
    }
  }

  return null
}

function getFormatCellInfo(module) {
  if (!state.analysis || module.focusKey !== 'format') return null

  const size = state.analysis.size
  const row = module.row
  const col = module.col
  let bitIndex = null
  let copy = null

  if (col === 8) {
    copy = 'vertical copy'
    if (row <= 5) {
      bitIndex = row
    } else if (row === 7) {
      bitIndex = 6
    } else if (row === 8) {
      bitIndex = 7
    } else if (row >= size - 7) {
      bitIndex = row - (size - 15)
    }
  } else if (row === 8) {
    copy = 'horizontal copy'
    if (col >= size - 8) {
      bitIndex = size - col - 1
    } else if (col === 7) {
      bitIndex = 8
    } else if (col <= 5) {
      bitIndex = 14 - col
    }
  }

  if (bitIndex == null) return null

  const encodedBits = FormatInfo.getEncodedBits(state.analysis.errorCorrectionLevel, state.analysis.maskPattern)
    .toString(2)
    .padStart(15, '0')
    .split('')
    .reverse()

  return {
    bitIndex,
    copy,
    totalBits: 15,
    encodedBit: encodedBits[bitIndex] || '0',
    ecLevel: state.analysis.errorCorrectionLevel,
    maskPattern: state.analysis.maskPattern,
    description: `Format info is a 15-bit structural field generated from error correction level ${state.analysis.errorCorrectionLevel} and mask pattern ${state.analysis.maskPattern}. The same 15 bits are written twice: once in the vertical strip by column 8 and once in the horizontal strip by row 8. This cell is bit ${bitIndex + 1} of that field in the ${copy}.`,
    entry: `The encoder writes the format bits directly into reserved cells. They are not treated as payload and they are not masked again by the data mask step.`
  }
}

function getPadInfo(module) {
  if (!state.analysis || module.focusKey !== 'pad' || module.source?.kind !== 'pad') return null

  const stats = state.analysis.stats
  const padValue = module.source.padValue ?? (module.source.padIndex % 2 === 0 ? 0xEC : 0x11)
  const padBits = module.source.padBits ?? padValue.toString(2).padStart(8, '0')
  const padByteIndex = (module.source.padByteIndex ?? module.source.padIndex ?? 0) + 1
  const bitPosition = module.source.codewordBitIndex != null
    ? module.source.codewordBitIndex + 1
    : (module.source.fieldBitIndex != null ? module.source.fieldBitIndex + 1 : null)
  const prePadBits = stats.segmentBits + stats.terminatorBits + stats.alignmentBits
  const paddedBits = stats.padBytes * 8

  return {
    padByteIndex,
    totalPadBytes: stats.padBytes,
    padValue,
    padHex: formatHexByte(padValue),
    padBits,
    bitPosition,
    segmentBits: stats.segmentBits,
    terminatorBits: stats.terminatorBits,
    alignmentBits: stats.alignmentBits,
    prePadBits,
    paddedBits,
    dataCapacityBits: stats.dataCapacityBits
  }
}

function getErrorCorrectionInfo(module) {
  if (!state.analysis || module.focusKey !== 'error-correction' || module.source?.kind !== 'error-correction') {
    return null
  }

  const block = getBlockById(module.blockId)
  if (!block) return null

  const codeword = block.errorCodewords[module.source.localCodewordIndex]
  if (!codeword) return null

  return {
    blockLabel: block.label,
    blockGroup: block.group,
    dataCodewordCount: block.dataCodewordCount,
    errorCodewordCount: block.errorCodewordCount,
    codewordIndex: module.source.localCodewordIndex + 1,
    totalBlocks: state.analysis.blocks.length,
    ecLevel: state.analysis.errorCorrectionLevel,
    value: codeword.value,
    bits: codeword.bits,
    byteHex: formatHexByte(codeword.value),
    bitPosition: module.source.codewordBitIndex != null
      ? module.source.codewordBitIndex + 1
      : (module.source.fieldBitIndex != null ? module.source.fieldBitIndex + 1 : null)
  }
}

function getCountFieldInfo(module, segment) {
  if (module.focusKey !== 'count' || !segment || module.source?.field !== 'count') return null

  const relatedModules = getOrderedModulesForSelection({ type: 'segment', id: segment.id })
    .filter((entry) => entry.source?.field === 'count')
  const fieldIndex = relatedModules.findIndex((entry) => entry.key === module.key)

  return {
    index: fieldIndex >= 0 ? fieldIndex + 1 : null,
    total: relatedModules.length || segment.charCountBits,
    rawBits: Number(segment.length).toString(2).padStart(segment.charCountBits, '0'),
    width: segment.charCountBits,
    unitLabel: getLengthUnitLabel(segment)
  }
}

function getActiveGroupOrder(module) {
  if (!state.activeSelection) return null

  const overlay = getActiveMatrixOverlay()
  const placement = overlay.placementLabels.get(module.key)
  if (!placement) return null

  return {
    current: Number(placement),
    total: overlay.selectedCount
  }
}

function getModuleNarrative(module) {
  const segment = module.source?.segmentId != null ? getSegmentById(module.source.segmentId) : null
  const chunk = getSegmentChunk(module, segment)
  const segmentLabel = segment ? `Segment ${segment.id + 1}` : null

  switch (module.focusKey) {
    case 'finder':
      return {
        represents: 'This cell is part of a finder pattern, the large target used to detect the QR code corners and orientation.',
        why: 'Finder patterns must exist so a scanner can quickly locate the symbol and understand which side is up.'
      }
    case 'separator':
      return {
        represents: 'This cell is part of the light separator around a finder pattern.',
        why: 'The separator creates a clean visual boundary so the finder pattern stands apart from timing, alignment, and data modules.'
      }
    case 'timing':
      return {
        represents: 'This cell belongs to the timing pattern, the alternating line that runs horizontally and vertically through the symbol.',
        why: 'Timing modules help a scanner count row and column spacing so it can map the grid correctly even if the image is skewed.'
      }
    case 'alignment':
      return {
        represents: 'This cell belongs to an alignment pattern.',
        why: 'Alignment patterns give the scanner extra reference points so it can correct distortion in larger QR versions.'
      }
    case 'format':
      return {
        represents: `This cell stores one bit of the format information, which encodes error correction level ${state.analysis.errorCorrectionLevel} and mask pattern ${state.analysis.maskPattern}.`,
        why: 'A decoder needs the format bits before reading the payload, because they tell it how the symbol was masked and how much recovery is available.'
      }
    case 'version':
      return {
        represents: `This cell stores one bit of the version information for version ${state.analysis.version}.`,
        why: 'Large QR codes repeat the version value in fixed positions so decoders know the exact symbol size and structure.'
      }
    case 'dark-module':
      return {
        represents: 'This is the fixed dark module required by the QR specification.',
        why: 'It is always set to dark in a specific position and acts as a structural constant in the symbol layout.'
      }
    case 'mode':
      return {
        represents: `This cell stores one bit of the 4-bit mode indicator for ${segmentLabel || 'the current segment'}${segment ? `, which is encoded as ${segment.mode}` : ''}.`,
        why: 'Mode bits must appear before the segment payload so the decoder knows whether to interpret the following data as numeric, alphanumeric, byte, or another mode.'
      }
    case 'count':
      return {
        represents: `This cell stores one bit of the character-count indicator for ${segmentLabel || 'the current segment'}${segment ? `, which contains ${segment.length} encoded units` : ''}.`,
        why: 'The count indicator tells the decoder how many characters or bytes belong to this segment before the next segment or padding begins.'
      }
    case 'payload':
      return {
        represents: segment
          ? `This cell stores actual payload data from ${segmentLabel} in ${segment.mode} mode${chunk ? `, specifically the chunk ${chunk.label}` : ''}.`
          : 'This cell stores actual payload data from the encoded text.',
        why: 'Payload cells carry the user input after it has been converted into QR bit groups according to the segment mode rules.'
      }
    case 'terminator':
      return {
        represents: 'This cell stores a terminator bit, a trailing zero added after the real payload ends.',
        why: 'Terminator bits mark the end of meaningful data before the encoder moves on to byte alignment and fixed pad bytes.'
      }
    case 'byte-align':
      return {
        represents: 'This cell stores a zero bit added only to reach a full byte boundary.',
        why: 'QR payloads are split into bytes before block processing, so any partial final byte has to be completed with zero bits.'
      }
    case 'pad':
      return {
        represents: `This cell comes from alternating pad byte ${(module.source?.padByteIndex ?? module.source?.padIndex ?? 0) + 1}${module.source?.padValue != null ? ` (${formatHexByte(module.source.padValue)} = ${module.source.padBits})` : ''}.`,
        why: 'If the chosen QR version still has unused data-byte capacity after payload, terminator, and byte alignment, the encoder appends alternating 0xEC and 0x11 bytes until the data stream is full. Those pad bits are then masked like the rest of the data stream.'
      }
    case 'error-correction':
      return {
        represents: `This cell stores a Reed-Solomon error-correction bit from ${module.blockLabel || 'its block'}.`,
        why: 'Error-correction bits are added so scanners can recover missing or damaged data modules when the QR code is partially obscured.'
      }
    case 'remainder':
      return {
        represents: 'This cell is a remainder bit, not part of any data or error-correction codeword.',
        why: 'Some QR versions have a few extra cells left after the full codeword stream is placed, so those leftover positions remain as fixed remainder bits.'
      }
    default:
      return {
        represents: 'This cell belongs to the QR symbol layout.',
        why: 'Every module is either structural or part of the encoded and protected bitstream.'
      }
  }
}

function renderStatus() {
  if (state.error) {
    statusPanel.innerHTML = `<p class="status status-error">${escapeHtml(state.error)}</p>`
    return
  }

  if (!state.analysis) {
    statusPanel.innerHTML = `
      <p class="status">
        Type a short message to generate a QR code. Keep it under about 160 characters
        so the interactive grid stays readable.
      </p>
    `
    return
  }

  const { version, size, maskPattern, errorCorrectionLevel } = state.analysis
  const animationPlan = getAnimationPlan()
  const animationPills = state.animation.running || state.animation.progress > 0
    ? `
      <span class="metric-pill">Animate ${animationPlan.progress} / ${animationPlan.total}</span>
      <span class="metric-pill">Now ${escapeHtml(animationPlan.currentLabel || 'starting')}</span>
    `
    : ''

  statusPanel.innerHTML = `
    <div class="status-metrics">
      <span class="metric-pill">Version ${version}</span>
      <span class="metric-pill">${size} × ${size} modules</span>
      <span class="metric-pill">Mask ${maskPattern}</span>
      <span class="metric-pill">EC ${errorCorrectionLevel}</span>
      ${animationPills}
    </div>
  `
}

function renderSummary() {
  if (!state.analysis) {
    summaryGrid.innerHTML = ''
    return
  }

  const { stats, segments } = state.analysis
  const cards = [
    ['Segments', `${segments.length}`],
    ['Blocks', `${stats.blocks}`],
    ['Codewords', `${stats.totalCodewords}`],
    ['Dark Modules', `${stats.darkModules}`]
  ]

  summaryGrid.innerHTML = cards.map(([label, value]) => `
    <article class="summary-card panel">
      <p>${label}</p>
      <strong>${value}</strong>
    </article>
  `).join('')
}

function renderCanvas() {
  const context = scanCanvas.getContext('2d')
  const analysis = state.analysis

  if (!analysis) {
    context.clearRect(0, 0, scanCanvas.width, scanCanvas.height)
    return
  }

  const frame = scanCanvas.parentElement.getBoundingClientRect()
  const cssSize = Math.max(Math.floor(Math.min(frame.width, 420)), 280)
  const devicePixelRatio = window.devicePixelRatio || 1
  const margin = 4
  const moduleSize = cssSize / (analysis.size + margin * 2)

  scanCanvas.width = Math.floor(cssSize * devicePixelRatio)
  scanCanvas.height = Math.floor(cssSize * devicePixelRatio)
  scanCanvas.style.width = `${cssSize}px`
  scanCanvas.style.height = `${cssSize}px`

  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
  context.clearRect(0, 0, cssSize, cssSize)
  context.fillStyle = '#fffdf8'
  context.fillRect(0, 0, cssSize, cssSize)

  context.fillStyle = '#0f172a'
  analysis.modules.forEach((module) => {
    if (!module.isDark) return
    context.fillRect(
      (module.col + margin) * moduleSize,
      (module.row + margin) * moduleSize,
      Math.ceil(moduleSize),
      Math.ceil(moduleSize)
    )
  })
}

function renderMatrix() {
  if (!state.analysis) {
    matrixShell.innerHTML = '<div class="empty-card">Your color-coded module map will appear here.</div>'
    return
  }

  const size = state.analysis.size
  const overlay = getActiveMatrixOverlay()
  const animationPlan = getAnimationPlan()
  const animated = animationPlan.total > 0 && (state.animation.running || state.animation.progress > 0)
  const cells = state.analysis.modules.map((module) => {
    const visual = getModuleVisual(module)
    const animationIndex = animationPlan.indexByKey.get(module.key)
    const isRevealed = !animated || (animationIndex != null && animationIndex < animationPlan.progress)
    const isCurrent = animated && animationIndex === animationPlan.progress - 1
    const cellOpacity = isRevealed ? visual.opacity : 0.08
    const cellStroke = isCurrent ? '#020617' : 'none'
    const cellStrokeWidth = isCurrent ? 0.05 : 0

    return `
      <g>
        <rect
          data-module-key="${module.key}"
          x="${module.col}"
          y="${module.row}"
          width="1"
          height="1"
          rx="0.08"
          fill="${visual.fill}"
          fill-opacity="${cellOpacity}"
          stroke="${cellStroke}"
          stroke-width="${cellStrokeWidth}"
          ${animated && !isRevealed ? 'data-animated-hidden="true"' : ''}
          ${isCurrent ? 'data-animated-current="true"' : ''}
          pointer-events="${isRevealed ? 'auto' : 'none'}"
        />
      </g>
    `
  }).join('')

  const selectionHighlights = state.analysis.modules.map((module) => {
    const animationIndex = animationPlan.indexByKey.get(module.key)
    const isRevealed = !animated || (animationIndex != null && animationIndex < animationPlan.progress)
    const isPinned = state.activeSelection?.type === 'module' && state.activeSelection.id === module.key
    const isHovered = state.hoveredModuleKey === module.key
    if ((!isPinned && !isHovered) || !isRevealed) return ''

    const stroke = isPinned ? '#020617' : '#1d4ed8'
    const haloStroke = isPinned ? 'rgba(255, 255, 255, 0.98)' : 'rgba(255, 255, 255, 0.92)'
    const haloWidth = isPinned ? 0.26 : 0.16
    const strokeWidth = isPinned ? 0.18 : 0.08
    const inset = isPinned ? 0.005 : 0.03

    return `
      <rect
        x="${module.col + inset}"
        y="${module.row + inset}"
        width="${1 - inset * 2}"
        height="${1 - inset * 2}"
        rx="0.12"
        fill="none"
        stroke="${haloStroke}"
        stroke-width="${haloWidth}"
        pointer-events="none"
        vector-effect="non-scaling-stroke"
      />
      <rect
        x="${module.col + inset}"
        y="${module.row + inset}"
        width="${1 - inset * 2}"
        height="${1 - inset * 2}"
        rx="0.1"
        fill="${isPinned ? 'rgba(2, 6, 23, 0.18)' : 'rgba(29, 78, 216, 0.08)'}"
        stroke="${stroke}"
        stroke-width="${strokeWidth}"
        pointer-events="none"
        vector-effect="non-scaling-stroke"
      />
    `
  }).join('')

  const matrixLabels = state.analysis.modules.map((module) => {
    const animationIndex = animationPlan.indexByKey.get(module.key)
    const isRevealed = !animated || (animationIndex != null && animationIndex < animationPlan.progress)
    if (!isRevealed) return ''

    const orderLabel = overlay.placementLabels.get(module.key)
    const bitTriplet = overlay.bitTriplets.get(module.key)
    const labelColor = module.isDark ? '#fffdf8' : '#111827'
    const labelStroke = module.isDark ? 'rgba(17, 24, 39, 0.8)' : 'rgba(255, 253, 248, 0.92)'

    return `
      <g>
        ${orderLabel ? `
          <text
            class="matrix-label ${bitTriplet ? 'matrix-label-order' : 'matrix-label-single'}"
            x="${module.col + 0.5}"
            y="${bitTriplet ? module.row + 0.34 : module.row + 0.54}"
            fill="${labelColor}"
            stroke="${labelStroke}"
            stroke-width="${bitTriplet ? '0.05' : '0.06'}"
            pointer-events="none"
            text-anchor="middle"
            dominant-baseline="middle"
          >${orderLabel}</text>
        ` : ''}
        ${bitTriplet ? `
          <text
            class="matrix-label matrix-label-bits"
            x="${module.col + 0.5}"
            y="${module.row + 0.74}"
            fill="${labelColor}"
            stroke="${labelStroke}"
            stroke-width="0.04"
            pointer-events="none"
            text-anchor="middle"
            dominant-baseline="middle"
          >${bitTriplet}</text>
        ` : ''}
      </g>
    `
  }).join('')

  matrixShell.innerHTML = `
    <div class="matrix-frame">
      <svg
        class="matrix-svg"
        viewBox="-2 -2 ${size + 4} ${size + 4}"
        aria-label="Interactive QR code module map"
      >
        <rect x="-2" y="-2" width="${size + 4}" height="${size + 4}" rx="1.6" fill="#fffdf8"></rect>
        ${cells}
        ${selectionHighlights}
        ${matrixLabels}
      </svg>
    </div>
  `
}

function renderMaskingPanel() {
  if (!state.analysis) {
    maskingPanel.innerHTML = '<div class="empty-card">Mask scoring appears once the QR code is generated.</div>'
    return
  }

  const { masking } = state.analysis
  const inspectedPattern = Number.isInteger(state.maskDetailPattern) ? state.maskDetailPattern : masking.chosenPattern
  const inspectedCandidate = getMaskCandidateByPattern(inspectedPattern) || masking.candidates[0]
  const n1Runs = inspectedCandidate.details.n1.runs
  const n2Blocks = inspectedCandidate.details.n2.blocks
  const n3Patterns = inspectedCandidate.details.n3.patterns
  const n4 = inspectedCandidate.details.n4

  maskingPanel.innerHTML = `
    <article class="mask-summary-card">
      <strong>Chosen mask: ${masking.chosenDetail.label} (${masking.chosenPattern})</strong>
      <p>${escapeHtml(masking.chosenDetail.formula)}</p>
      <p>${escapeHtml(masking.decisionRule)}</p>
      <p>${escapeHtml(masking.finalBitRule)}</p>
    </article>
    ${masking.candidates.map((candidate) => `
      <button
        type="button"
        class="mask-card ${candidate.chosen ? 'active' : ''} ${candidate.pattern === inspectedCandidate.pattern ? 'inspected' : ''}"
        data-mask-pattern="${candidate.pattern}"
      >
        <div class="mask-card-head">
          <strong>${candidate.label}</strong>
          <span class="badge">${candidate.chosen ? 'Chosen' : `Total ${candidate.penalties.total}`}</span>
        </div>
        <p class="preview mono">${escapeHtml(candidate.formula)}</p>
        <div class="mask-score-grid">
          <span>N1 ${candidate.penalties.n1}</span>
          <span>N2 ${candidate.penalties.n2}</span>
          <span>N3 ${candidate.penalties.n3}</span>
          <span>N4 ${candidate.penalties.n4}</span>
          <span>Total ${candidate.penalties.total}</span>
        </div>
      </button>
    `).join('')}
    <article class="mask-detail-card">
      <div class="mask-card-head">
        <strong>${inspectedCandidate.label} detail</strong>
        <span class="badge">${inspectedCandidate.chosen ? 'Chosen mask' : `Inspecting mask ${inspectedCandidate.pattern}`}</span>
      </div>

      <p class="preview mono">${escapeHtml(inspectedCandidate.formula)}</p>
      <p class="preview">For every writable module, the final visible bit is still <span class="mono">raw XOR mask</span>. The penalty rules score the completed matrix after that masking step.</p>

      <div class="mask-detail-section">
        <strong>N1: Long runs of the same color</strong>
        <p>Each horizontal or vertical run of 5 adds 3 points. Every extra module beyond 5 adds 1 more point.</p>
        <div class="inspect-grid mask-metric-grid">
          <div><span>Runs counted</span><strong>${n1Runs.length}</strong></div>
          <div><span>N1 total</span><strong>${inspectedCandidate.penalties.n1}</strong></div>
        </div>
        <div class="mask-run-list">
          ${n1Runs.map((run) => `
            <div class="mask-run-row">
              <strong>${run.direction === 'row' ? `Row ${run.lineIndex}` : `Col ${run.lineIndex}`}</strong>
              <span>${run.direction === 'row' ? `cols ${run.start}-${run.end}` : `rows ${run.start}-${run.end}`}</span>
              <span>${run.color} run</span>
              <span>len ${run.length}</span>
              <span>${run.penalty} pts</span>
            </div>
          `).join('') || '<p class="preview">No row or column run reached length 5, so N1 is 0.</p>'}
        </div>
      </div>

      <div class="mask-detail-section">
        <strong>N2: 2×2 blocks of the same color</strong>
        <p>Every 2×2 block where all four modules are dark or all four are light adds 3 points.</p>
        <div class="inspect-grid mask-metric-grid">
          <div><span>2×2 blocks</span><strong>${n2Blocks.length}</strong></div>
          <div><span>Points each</span><strong>3</strong></div>
          <div><span>N2 total</span><strong>${inspectedCandidate.penalties.n2}</strong></div>
        </div>
        <div class="mask-run-list">
          ${n2Blocks.map((block) => `
            <div class="mask-run-row">
              <strong>Top-left (${block.row}, ${block.col})</strong>
              <span>rows ${block.row}-${block.row + 1}</span>
              <span>cols ${block.col}-${block.col + 1}</span>
              <span>${block.color} block</span>
              <span>${block.penalty} pts</span>
            </div>
          `).join('') || '<p class="preview">No 2×2 monochrome block was found, so N2 is 0.</p>'}
        </div>
      </div>

      <div class="mask-detail-section">
        <strong>N3: Finder-like 1:1:3:1:1 windows</strong>
        <p>The QR library slides an 11-module window across every row and column. Each window matching <span class="mono">10111010000</span> or <span class="mono">00001011101</span> adds 40 points because it resembles finder-pattern timing.</p>
        <div class="inspect-grid mask-metric-grid">
          <div><span>Windows matched</span><strong>${n3Patterns.length}</strong></div>
          <div><span>Points each</span><strong>40</strong></div>
          <div><span>N3 total</span><strong>${inspectedCandidate.penalties.n3}</strong></div>
        </div>
        <div class="mask-run-list">
          ${n3Patterns.map((pattern) => `
            <div class="mask-run-row">
              <strong>${pattern.direction === 'row' ? `Row ${pattern.lineIndex}` : `Col ${pattern.lineIndex}`}</strong>
              <span>${pattern.direction === 'row' ? `cols ${pattern.start}-${pattern.end}` : `rows ${pattern.start}-${pattern.end}`}</span>
              <span class="mono">${pattern.bits}</span>
              <span>finder-like</span>
              <span>${pattern.penalty} pts</span>
            </div>
          `).join('') || '<p class="preview">No finder-like 11-bit window was found, so N3 is 0.</p>'}
        </div>
      </div>

      <div class="mask-detail-section">
        <strong>N4: Dark/light balance</strong>
        <p>The QR library counts dark modules, converts that to a percentage, rounds up to the next 5% bucket, compares that bucket to 50%, then multiplies the step distance by 10.</p>
        <div class="inspect-grid mask-metric-grid">
          <div><span>Dark modules</span><strong>${n4.darkModules}</strong></div>
          <div><span>Total modules</span><strong>${n4.totalModules}</strong></div>
          <div><span>Dark %</span><strong>${n4.darkPercent.toFixed(2)}%</strong></div>
          <div><span>5% bucket</span><strong>${n4.bucket}%</strong></div>
          <div><span>Deviation steps</span><strong>${n4.deviationSteps}</strong></div>
          <div><span>N4 total</span><strong>${inspectedCandidate.penalties.n4}</strong></div>
        </div>
        <p class="preview mono">ceil(${n4.darkModules} × 100 / ${n4.totalModules} / 5) = ${Math.ceil(n4.darkPercent / 5)}; |${Math.ceil(n4.darkPercent / 5)} - 10| = ${n4.deviationSteps}; ${n4.deviationSteps} × 10 = ${n4.score}</p>
      </div>
    </article>
  `
}

function renderLegend() {
  if (!state.analysis) {
    legendPanel.innerHTML = '<div class="empty-card">The legend updates once a QR code exists.</div>'
    return
  }

  legendPanel.innerHTML = FOCUS_ORDER
    .filter((key) => state.analysis.counts.focus[key])
    .map((key) => {
      const isActive = isSelectionActive('focus', key)
      return `
        <button
          type="button"
          class="token-card ${isActive ? 'active' : ''}"
          data-select-type="focus"
          data-select-id="${key}"
        >
          <span class="token-swatch" style="--swatch:${FOCUS_COLORS[key]}"></span>
          <span class="token-copy">
            <strong>${FOCUS_LABELS[key]}</strong>
            <small>${state.analysis.counts.focus[key]} modules</small>
          </span>
        </button>
      `
    }).join('')
}

function renderSegments() {
  if (!state.analysis) {
    segmentsPanel.innerHTML = '<div class="empty-card">Segment choices appear here.</div>'
    return
  }

  segmentsPanel.innerHTML = state.analysis.segments.map((segment) => {
    const color = getSegmentColor(segment.id)
    const isActive = isSelectionActive('segment', segment.id)
    const blockLabels = segment.blockIds
      .map((blockId) => getBlockById(blockId)?.label)
      .filter(Boolean)
      .join(' · ')
    const chunkLabels = segment.chunks
      .map((chunk) => `
        <span class="mini-chip">
          ${escapeHtml(chunk.label)}
          <small>${chunk.bitLength}b</small>
        </span>
      `)
      .join('')

    return `
      <button
        type="button"
        class="info-card ${isActive ? 'active' : ''}"
        data-select-type="segment"
        data-select-id="${segment.id}"
      >
        <div class="info-top">
          <div class="info-title">
            <span class="token-swatch" style="--swatch:${color}"></span>
            <div>
              <strong>Segment ${segment.id + 1}</strong>
              <small>${segment.mode}</small>
            </div>
          </div>
          <span class="badge">${segment.moduleCount} modules</span>
        </div>

        <p class="preview mono">"${escapeHtml(segment.text)}"</p>

        <div class="info-meta">
          <span>${segment.length} units</span>
          <span>${segment.totalBits} bits</span>
          <span>${blockLabels || 'single block'}</span>
        </div>

        <div class="bit-breakdown">
          <div class="bit-line">
            <strong>Mode</strong>
            <span class="mono bit-value">${segment.modeBitString}</span>
          </div>
          <div class="bit-line">
            <strong>Count</strong>
            <span class="mono bit-value">${segment.countBitString}</span>
          </div>
          <div class="bit-line">
            <strong>Payload</strong>
            <span class="mono bit-value">${segment.payloadBitString || '—'}</span>
          </div>
          <div class="bit-line bit-line-full">
            <strong>Full segment</strong>
            <span class="mono bit-value">${segment.fullBitString}</span>
          </div>
        </div>

        <div class="mini-chip-row">
          ${chunkLabels}
        </div>
      </button>
    `
  }).join('')
}

function renderPayloadGroups() {
  if (!state.analysis) {
    payloadGroupsPanel.innerHTML = '<div class="empty-card">Payload groups will appear here once the text is encoded.</div>'
    return
  }

  const groups = getPayloadGroups()

  payloadGroupsPanel.innerHTML = groups.map((group) => {
    const isActive = isSelectionActive('chunk', group.id)
    const color = getSegmentColor(group.segmentId)

    return `
      <button
        type="button"
        class="info-card ${isActive ? 'active' : ''}"
        data-select-type="chunk"
        data-select-id="${group.id}"
      >
        <div class="info-top">
          <div class="info-title">
            <span class="token-swatch" style="--swatch:${color}"></span>
            <div>
              <strong>${escapeHtml(group.label)}</strong>
              <small>${getChunkKindLabel(group)} · S${group.segmentId + 1} · G${group.chunkIndex + 1}</small>
            </div>
          </div>
          <span class="badge">${group.moduleCount} modules</span>
        </div>

        <div class="info-meta">
          <span>${group.bitLength} bits</span>
          <span>${group.startBit}-${group.endBit - 1}</span>
          <span>${group.modeLabel || group.segmentMode}</span>
        </div>

        <p class="preview">${escapeHtml(group.encodingSummary || group.bits)}</p>
        <p class="preview mono">${group.bits}</p>
      </button>
    `
  }).join('')
}

function renderBlocks() {
  if (!state.analysis) {
    blocksPanel.innerHTML = '<div class="empty-card">Block splitting appears here.</div>'
    return
  }

  blocksPanel.innerHTML = state.analysis.blocks.map((block) => {
    const color = getBlockColor(block.id)
    const isActive = isSelectionActive('block', block.id)

    return `
      <button
        type="button"
        class="info-card ${isActive ? 'active' : ''}"
        data-select-type="block"
        data-select-id="${block.id}"
      >
        <div class="info-top">
          <div class="info-title">
            <span class="token-swatch" style="--swatch:${color}"></span>
            <div>
              <strong>${block.label}</strong>
              <small>Group ${block.group}</small>
            </div>
          </div>
          <span class="badge">${block.dataCodewordCount}+${block.errorCodewordCount}</span>
        </div>

        <div class="info-meta">
          <span>${block.dataCodewordCount} data cw</span>
          <span>${block.errorCodewordCount} EC cw</span>
          <span>${block.segmentLabels.join(', ') || 'pad only'}</span>
        </div>

        <p class="preview mono">${escapeHtml(block.sourcePreview || 'No preview')}</p>
      </button>
    `
  }).join('')
}

function formatCodewordPreview(codewords, limit = 10) {
  if (!codewords.length) return '—'

  const preview = codewords
    .slice(0, limit)
    .map((codeword) => formatHexByte(codeword.value))
    .join(' ')

  return codewords.length > limit ? `${preview} …` : preview
}

function summarizeReedSolomonGroups(blocks) {
  const families = new Map()

  blocks.forEach((block) => {
    const key = `${block.group}:${block.dataCodewordCount}:${block.errorCodewordCount}`
    const existing = families.get(key)

    if (existing) {
      existing.count += 1
      return
    }

    families.set(key, {
      group: block.group,
      dataCodewordCount: block.dataCodewordCount,
      errorCodewordCount: block.errorCodewordCount,
      count: 1
    })
  })

  return [...families.values()]
    .map((family) => (
      `${family.count} block${family.count === 1 ? '' : 's'} in Group ${family.group} ` +
      `with ${family.dataCodewordCount} data byte${family.dataCodewordCount === 1 ? '' : 's'} ` +
      `and ${family.errorCodewordCount} parity byte${family.errorCodewordCount === 1 ? '' : 's'} each`
    ))
    .join(' · ')
}

function renderReedSolomonPanel() {
  if (!state.analysis) {
    reedSolomonPanel.innerHTML = '<div class="empty-card">Reed-Solomon error correction appears once a QR code is generated.</div>'
    return
  }

  const { blocks, stats, finalCodewords } = state.analysis
  const ecPerBlock = blocks[0]?.errorCodewordCount || 0
  const groupedSummary = summarizeReedSolomonGroups(blocks)
  const dataSizes = new Set(blocks.map((block) => block.dataCodewordCount))
  const hasMixedDataSizes = dataSizes.size > 1
  const errorCorrectionStream = finalCodewords
    .filter((codeword) => codeword.type === 'error-correction')
    .slice(0, 12)
  const errorCorrectionPreview = errorCorrectionStream.length
    ? errorCorrectionStream
      .map((codeword) => `${codeword.blockLabel}·P${codeword.localIndex + 1}=${formatHexByte(codeword.value)}`)
      .join('  ')
    : '—'

  reedSolomonPanel.innerHTML = `
    <article class="rs-card rs-card-wide">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Error correction</p>
          <h3>How Reed-Solomon fits into this QR</h3>
        </div>
      </div>

      <p class="preview">
        QR does not send the raw data bytes into the matrix unprotected. It first splits the
        data stream into blocks, then computes Reed-Solomon parity bytes for each block.
        Those parity bytes are the remainder produced by the encoder over byte values in
        GF(256), which lets a scanner recover from missing or damaged modules later.
      </p>

      <div class="inspect-grid">
        <div><span>Blocks</span><strong>${blocks.length}</strong></div>
        <div><span>Data bytes</span><strong>${stats.dataCodewords}</strong></div>
        <div><span>Parity bytes</span><strong>${stats.errorCorrectionCodewords}</strong></div>
        <div><span>Parity / block</span><strong>${ecPerBlock}</strong></div>
      </div>

      <div class="rs-flow-list">
        <div class="rs-flow-item">
          <span class="mono-label">1</span>
          <p class="preview">
            Build the full data byte stream first. That includes segment headers, payload,
            terminator bits, byte alignment, and pad bytes.
          </p>
        </div>
        <div class="rs-flow-item">
          <span class="mono-label">2</span>
          <p class="preview">
            Split the data bytes into ${blocks.length} block${blocks.length === 1 ? '' : 's'}.
            For this QR: ${escapeHtml(groupedSummary)}.
          </p>
        </div>
        <div class="rs-flow-item">
          <span class="mono-label">3</span>
          <p class="preview">
            Generate ${ecPerBlock} parity byte${ecPerBlock === 1 ? '' : 's'} for each block,
            then interleave all data codewords first and all parity codewords after that before placement and masking.
          </p>
        </div>
      </div>
    </article>

    <article class="rs-card rs-card-wide">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Interleaving</p>
          <h3>What the final parity stream looks like</h3>
        </div>
      </div>

      <p class="preview">
        The QR encoder takes one data byte from each block at a time. After the data pass is
        finished, it does the same with the Reed-Solomon parity bytes. ${hasMixedDataSizes
          ? 'Because this version has mixed block sizes, the longer group contributes one extra data byte before parity interleaving begins.'
          : 'Because every block is the same size here, each data round pulls one byte from every block.'}
      </p>

      <div class="rs-codeword-box">
        <span class="mono-label">First parity bytes in interleaved order</span>
        <p class="preview mono">${escapeHtml(errorCorrectionPreview)}</p>
      </div>
    </article>

    ${blocks.map((block) => `
      <article class="rs-card">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Block ${block.id + 1}</p>
            <h3>${block.label}</h3>
          </div>
          <span class="badge">${block.dataCodewordCount}+${block.errorCodewordCount}</span>
        </div>

        <p class="preview">
          This block starts with ${block.dataCodewordCount} data byte${block.dataCodewordCount === 1 ? '' : 's'}
          and Reed-Solomon generates ${block.errorCodewordCount} parity byte${block.errorCodewordCount === 1 ? '' : 's'} from them.
        </p>

        <div class="rs-codeword-columns">
          <div class="rs-codeword-box">
            <span class="mono-label">Data bytes</span>
            <p class="preview mono">${escapeHtml(formatCodewordPreview(block.dataCodewords, 12))}</p>
          </div>
          <div class="rs-codeword-box">
            <span class="mono-label">Parity bytes</span>
            <p class="preview mono">${escapeHtml(formatCodewordPreview(block.errorCodewords, 12))}</p>
          </div>
        </div>
      </article>
    `).join('')}
  `
}

function renderSelectionSummary() {
  if (!state.activeSelection || !state.analysis) {
    return `
      <div class="empty-card">
        Click a legend item, segment, block, or matrix cell to pin more detail.
      </div>
    `
  }

  if (state.activeSelection.type === 'segment') {
    const segment = getSegmentById(state.activeSelection.id)
    const overlay = getActiveMatrixOverlay()
    if (!segment) return ''

    return `
      <div class="inspector-stack">
        <h3>Segment ${segment.id + 1}</h3>
        <p>${segment.mode} mode was chosen for <span class="mono">"${escapeHtml(segment.text)}"</span>.</p>
        ${overlay.placementLabels.size ? `
          <p>${overlay.hasDetailedBits ? 'The matrix shows placement order on top and raw/mask/final bits underneath, where raw XOR mask = final.' : 'Numbers on the matrix show the placement order of this selected group.'}</p>
        ` : ''}
        <div class="inspect-grid">
          <div><span>Total bits</span><strong>${segment.totalBits}</strong></div>
          <div><span>Payload bits</span><strong>${segment.payloadBits}</strong></div>
          <div><span>Modules touched</span><strong>${segment.moduleCount}</strong></div>
          <div><span>Blocks</span><strong>${segment.blockIds.length || 1}</strong></div>
        </div>
      </div>
    `
  }

  if (state.activeSelection.type === 'chunk') {
    const group = getPayloadGroupById(state.activeSelection.id)
    const overlay = getActiveMatrixOverlay()
    if (!group) return ''

    return `
      <div class="inspector-stack">
        <h3>Payload Group ${group.chunkIndex + 1}</h3>
        <p>
          <span class="mono">"${escapeHtml(group.label)}"</span> is encoded as an individual ${getChunkKindLabel(group).toLowerCase()}
          inside Segment ${group.segmentId + 1}.
        </p>
        ${overlay.placementLabels.size ? `
          <p>${overlay.hasDetailedBits ? 'The matrix shows placement order on top and raw/mask/final bits underneath, where raw XOR mask = final.' : 'Numbers on the matrix show the placement order of this selected group.'}</p>
        ` : ''}
        <div class="inspect-grid">
          <div><span>Segment</span><strong>S${group.segmentId + 1}</strong></div>
          <div><span>Chunk</span><strong>${group.chunkIndex + 1}</strong></div>
          <div><span>Bit length</span><strong>${group.bitLength}</strong></div>
          <div><span>Modules</span><strong>${group.moduleCount}</strong></div>
          <div><span>Bit range</span><strong>${group.startBit}-${group.endBit - 1}</strong></div>
          <div><span>Raw bits</span><strong class="mono">${group.bits}</strong></div>
        </div>
        <div class="subnote">
          <strong>Step 2</strong>
          <p>The payload-group card in Step 2 shows the full encoding path for this group.</p>
        </div>
      </div>
    `
  }

  if (state.activeSelection.type === 'block') {
    const block = getBlockById(state.activeSelection.id)
    const overlay = getActiveMatrixOverlay()
    if (!block) return ''

    return `
      <div class="inspector-stack">
        <h3>${block.label}</h3>
        <p>This block collects payload bytes first, then its own Reed-Solomon parity bytes.</p>
        ${overlay.placementLabels.size ? `
          <p>${overlay.hasDetailedBits ? 'The matrix shows placement order on top and raw/mask/final bits underneath, where raw XOR mask = final.' : 'Numbers on the matrix show the placement order of this selected group.'}</p>
        ` : ''}
        <div class="inspect-grid">
          <div><span>Data codewords</span><strong>${block.dataCodewordCount}</strong></div>
          <div><span>EC codewords</span><strong>${block.errorCodewordCount}</strong></div>
          <div><span>Input segments</span><strong>${block.segmentLabels.join(', ') || 'pad'}</strong></div>
          <div><span>Group</span><strong>${block.group}</strong></div>
        </div>
      </div>
    `
  }

  if (state.activeSelection.type === 'focus') {
    const key = state.activeSelection.id
    const overlay = getActiveMatrixOverlay()
    return `
      <div class="inspector-stack">
        <h3>${FOCUS_LABELS[key]}</h3>
        <p>${state.analysis.counts.focus[key]} modules are highlighted in the current QR symbol.</p>
        ${overlay.placementLabels.size ? `
          <p>${overlay.hasDetailedBits ? 'Each highlighted cell shows placement order on the first line and raw/mask/final bits on the second line, where raw XOR mask = final.' : 'Numbers on the matrix show the order those cells were placed inside this group.'}</p>
        ` : ''}
        ${key === 'error-correction' ? `
          <div class="subnote">
            <strong>Error Correction</strong>
            <p>
              QR codes add Reed-Solomon parity after the full data byte stream is built. The data bytes are split into ${state.analysis.blocks.length} block${state.analysis.blocks.length === 1 ? '' : 's'}, each block generates its own parity bytes, then data codewords are interleaved first and error-correction codewords are interleaved after that. These bits are still placed into the matrix and masked like the rest of the writable stream.
            </p>
          </div>
        ` : ''}
      </div>
    `
  }

  return ''
}

function renderInspector() {
  if (!state.analysis) {
    inspectorPanel.innerHTML = '<div class="empty-card">Inspectors show up after a QR code is generated.</div>'
    return
  }

  const module = getSelectedModule()
  if (!module) {
    inspectorPanel.innerHTML = renderSelectionSummary()
    return
  }

  const segment = module.source?.segmentId != null ? getSegmentById(module.source.segmentId) : null
  const chunk = getSegmentChunk(module, segment)
  const narrative = getModuleNarrative(module)
  const isPinned = state.activeSelection?.type === 'module' && state.activeSelection.id === module.key
  const activeGroupOrder = getActiveGroupOrder(module)
  const countFieldInfo = getCountFieldInfo(module, segment)
  const formatInfo = getFormatCellInfo(module)
  const payloadGroup = chunk && segment ? getPayloadGroupById(getChunkSelectionId(segment.id, chunk.index)) : null
  const padInfo = getPadInfo(module)
  const errorCorrectionInfo = getErrorCorrectionInfo(module)
  const paddingContextInfo = getPaddingContextInfo(module)

  inspectorPanel.innerHTML = `
    <div class="inspector-stack">
      <h3>Module (${module.row}, ${module.col})</h3>
      <p>
        ${isPinned ? 'Pinned cell' : 'Hover preview'} • ${describeFocus(module)}${segment ? ` from Segment ${segment.id + 1}` : ''}
      </p>

      <div class="inspect-grid">
        <div><span>Final bit</span><strong>${getFinalBit(module)}</strong></div>
        <div><span>Raw bit</span><strong>${module.rawValue ?? '—'}</strong></div>
        <div><span>Mask bit</span><strong>${module.maskBit ?? '—'}</strong></div>
        <div><span>Masked?</span><strong>${module.rawValue == null ? '—' : (module.flippedByMask ? 'Yes' : 'No')}</strong></div>
        <div><span>Path slot</span><strong>${module.rawValue == null ? 'Skipped' : getPlacementSlotLabel(module)}</strong></div>
        <div><span>Codeword</span><strong>${module.codewordIndex != null ? `#${module.codewordIndex}` : '—'}</strong></div>
        <div><span>Bit slot</span><strong>${getModuleBitLabel(module)}</strong></div>
        <div><span>Block</span><strong>${module.blockLabel || '—'}</strong></div>
        <div><span>Category</span><strong>${describeFocus(module)}</strong></div>
        <div><span>Active Group</span><strong>${activeGroupOrder ? `${activeGroupOrder.current} / ${activeGroupOrder.total}` : '—'}</strong></div>
      </div>

      ${countFieldInfo ? `
        <div class="subnote">
          <strong>Count Field</strong>
          <p>
            Count bit ${countFieldInfo.index} of ${countFieldInfo.total}. In ${segment.mode} mode for version ${state.analysis.version},
            the count field is ${countFieldInfo.width} bits wide. This segment contains ${segment.length}
            ${countFieldInfo.unitLabel}, so the raw count bits are <span class="mono">${countFieldInfo.rawBits}</span>.
          </p>
        </div>
      ` : ''}

      ${formatInfo ? `
        <div class="subnote">
          <strong>Format Info</strong>
          <p>
            ${escapeHtml(formatInfo.description)}
          </p>
          <p>
            The bit stored here is <span class="mono">${formatInfo.encodedBit}</span>. ${escapeHtml(formatInfo.entry)}
          </p>
          <div class="inspect-grid">
            <div><span>Bit</span><strong>${formatInfo.bitIndex + 1} of ${formatInfo.totalBits}</strong></div>
            <div><span>Copy</span><strong>${formatInfo.copy}</strong></div>
            <div><span>EC Level</span><strong>${formatInfo.ecLevel}</strong></div>
            <div><span>Mask Pattern</span><strong>${formatInfo.maskPattern}</strong></div>
          </div>
        </div>
      ` : ''}

      ${payloadGroup ? `
        <div class="subnote">
          <strong>Payload Group</strong>
          <p>
            This cell belongs to payload group ${payloadGroup.chunkIndex + 1} in Segment ${payloadGroup.segmentId + 1}.
            The group is <span class="mono">"${escapeHtml(payloadGroup.label)}"</span>, encoded as ${getChunkKindLabel(payloadGroup).toLowerCase()},
            and its raw bits are <span class="mono">${payloadGroup.bits}</span>.
          </p>
        </div>
      ` : ''}

      ${padInfo ? `
        <div class="subnote">
          <strong>Padding</strong>
          <p>
            This QR used ${padInfo.segmentBits} payload/header bits, then ${padInfo.terminatorBits} terminator bit${padInfo.terminatorBits === 1 ? '' : 's'}, then ${padInfo.alignmentBits} byte-alignment zero bit${padInfo.alignmentBits === 1 ? '' : 's'}.
            That left ${padInfo.dataCapacityBits - padInfo.prePadBits} data bits still empty, so the encoder appended ${padInfo.totalPadBytes} alternating pad byte${padInfo.totalPadBytes === 1 ? '' : 's'}:
            <span class="mono">0xEC</span>, <span class="mono">0x11</span>, <span class="mono">0xEC</span>, <span class="mono">0x11</span>, ...
          </p>
          <p>
            This cell belongs to pad byte ${padInfo.padByteIndex} of ${padInfo.totalPadBytes}:
            <span class="mono">${padInfo.padHex}</span> = <span class="mono">${padInfo.padBits}</span>.
            It is bit ${padInfo.bitPosition} of that byte. The full padding tail contributed ${padInfo.paddedBits} bits.
          </p>
          <p>
            Pad bytes are not special after insertion. They become normal data bits, are placed into the QR matrix, and are masked using the same row/column rule as payload bits:
            <span class="mono">${module.rawValue} XOR ${module.maskBit} = ${getFinalBit(module)}</span>.
          </p>
        </div>
      ` : ''}

      ${paddingContextInfo ? `
        <div class="subnote">
          <strong>${paddingContextInfo.title}</strong>
          <p>${escapeHtml(paddingContextInfo.body)}</p>
        </div>
      ` : ''}

      ${errorCorrectionInfo ? `
        <div class="subnote">
          <strong>Error Correction</strong>
          <p>
            QR error correction is added after the full data stream is assembled. This QR built the data bytes first, split them into ${errorCorrectionInfo.totalBlocks} block${errorCorrectionInfo.totalBlocks === 1 ? '' : 's'}, then generated Reed-Solomon parity for each block at EC level ${errorCorrectionInfo.ecLevel}.
          </p>
          <p>
            This cell belongs to parity byte ${errorCorrectionInfo.codewordIndex} of ${errorCorrectionInfo.errorCodewordCount} from ${errorCorrectionInfo.blockLabel}. That block started with ${errorCorrectionInfo.dataCodewordCount} data codeword${errorCorrectionInfo.dataCodewordCount === 1 ? '' : 's'}, then the Reed-Solomon remainder produced this parity byte:
            <span class="mono">${errorCorrectionInfo.byteHex}</span> = <span class="mono">${errorCorrectionInfo.bits}</span>.
            This module is bit ${errorCorrectionInfo.bitPosition} of that byte.
          </p>
          <p>
            After all data codewords were interleaved, the error-correction codewords were interleaved into the final stream, placed into the QR matrix, and masked just like payload bits:
            <span class="mono">${module.rawValue} XOR ${module.maskBit} = ${getFinalBit(module)}</span>.
          </p>
        </div>
      ` : ''}

      <div class="subnote">
        <strong>What It Represents</strong>
        <p>${escapeHtml(narrative.represents)}</p>
      </div>

      <div class="subnote">
        <strong>Why It Is There</strong>
        <p>${escapeHtml(narrative.why)}</p>
      </div>

      <div class="subnote">
        <strong>How It Was Placed</strong>
        <p>${escapeHtml(getPlacementSummary(module))}</p>
      </div>

      <div class="subnote">
        <strong>Mask Formula</strong>
        <p>${escapeHtml(getMaskFormulaSummary(module))}</p>
      </div>

      <div class="subnote">
        <strong>Mask Result</strong>
        <p>${escapeHtml(getMaskSummary(module))}</p>
        <p>${escapeHtml(getFinalBitSummary(module))}</p>
      </div>

      ${segment ? `
        <div class="subnote">
          <strong>Source</strong>
          <p>
            ${segment.mode} segment <span class="mono">"${escapeHtml(segment.text)}"</span>
            ${chunk ? `• chunk ${escapeHtml(chunk.label)}` : ''}
          </p>
        </div>
      ` : ''}
    </div>
  `
}

function validateSelection() {
  const selection = state.activeSelection
  if (!selection || !state.analysis) return

  if (selection.type === 'segment' && !getSegmentById(selection.id)) {
    state.activeSelection = null
  }

  if (selection.type === 'chunk' && !getPayloadGroupById(selection.id)) {
    state.activeSelection = null
  }

  if (selection.type === 'block' && !getBlockById(selection.id)) {
    state.activeSelection = null
  }

  if (selection.type === 'module' && !findModule(selection.id)) {
    state.activeSelection = null
  }
}

function validateMaskDetailSelection() {
  if (!state.analysis) {
    state.maskDetailPattern = null
    return
  }

  if (!Number.isInteger(state.maskDetailPattern)) return

  if (!getMaskCandidateByPattern(state.maskDetailPattern)) {
    state.maskDetailPattern = null
  }
}

function render() {
  try {
    const trimmed = state.text.trim()

    if (!trimmed) {
      state.analysis = null
      state.error = null
    } else {
      state.analysis = analyzeQr(trimmed, state.errorCorrectionLevel)
      state.error = null
    }
  } catch (error) {
    state.analysis = null
    state.error = error instanceof Error ? error.message : 'Unable to generate QR code.'
  }

  validateSelection()
  validateMaskDetailSelection()

  overlayModes.querySelectorAll('button').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === state.overlayMode)
  })

  renderStatus()
  renderSummary()
  renderCanvas()
  renderMatrix()
  renderMaskingPanel()
  renderLegend()
  renderSegments()
  renderPayloadGroups()
  renderBlocks()
  renderReedSolomonPanel()
  renderInspector()
  updateAnimationButtons()
}

textInput.addEventListener('input', (event) => {
  stopAnimation({ reset: true })
  state.text = event.target.value
  state.maskDetailPattern = null
  state.hoveredModuleKey = null
  render()
})

eccSelect.addEventListener('change', (event) => {
  stopAnimation({ reset: true })
  state.errorCorrectionLevel = event.target.value
  state.maskDetailPattern = null
  state.hoveredModuleKey = null
  render()
})

overlayModes.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-mode]')
  if (!button) return
  state.overlayMode = button.dataset.mode
  render()
})

clearFocusButton.addEventListener('click', () => {
  state.activeSelection = null
  state.hoveredModuleKey = null
  render()
})

animateButton.addEventListener('click', toggleAnimation)
singleStepButton.addEventListener('click', advanceSingleStep)
groupStepButton.addEventListener('click', advanceGroupStep)

function bindSelectionPanel(panel) {
  panel.addEventListener('click', (event) => {
    const button = event.target.closest('[data-select-type]')
    if (!button) return

    const type = button.dataset.selectType
    const rawId = button.dataset.selectId
    const id = type === 'focus' || type === 'module' || type === 'chunk' ? rawId : Number(rawId)
    setSelection({ type, id })
  })
}

bindSelectionPanel(legendPanel)
bindSelectionPanel(segmentsPanel)
bindSelectionPanel(payloadGroupsPanel)
bindSelectionPanel(blocksPanel)

maskingPanel.addEventListener('click', (event) => {
  const button = event.target.closest('[data-mask-pattern]')
  if (!button) return
  state.maskDetailPattern = Number(button.dataset.maskPattern)
  renderMaskingPanel()
})

matrixShell.addEventListener('pointermove', (event) => {
  const target = event.target.closest('[data-module-key]')
  const nextKey = target ? target.dataset.moduleKey : null
  if (nextKey === state.hoveredModuleKey) return
  state.hoveredModuleKey = nextKey
  renderMatrix()
  renderInspector()
})

matrixShell.addEventListener('mouseleave', () => {
  if (!state.hoveredModuleKey) return
  state.hoveredModuleKey = null
  renderMatrix()
  renderInspector()
})

matrixShell.addEventListener('click', (event) => {
  const target = event.target.closest('[data-module-key]')
  if (!target) return
  setSelection({ type: 'module', id: target.dataset.moduleKey })
})

window.addEventListener('resize', () => {
  if (!state.analysis) return
  renderCanvas()
})

render()
