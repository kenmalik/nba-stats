import * as d3 from 'd3'
import './style.css'

type PlayerStats = {
  assist_percentage: number
  points: number
  rebounds: number
  assists: number
  offensive_rebound_percentage: number
  defensive_rebound_percentage: number
  true_shooting_percentage: number
}

type SeasonStats = {
  season: string
  team_abbreviation: string
  box_stats: PlayerStats
}

type Player = {
  name: string
  seasons: SeasonStats[]
}

type ChartMode = 'spider' | 'parallel'

type ChartRecord = {
  name: string
  season: string
  teamAbbreviation: string
  boxStats: PlayerStats
}

type StatSummary = {
  key: (typeof STAT_KEYS)[number]
  min: number
  max: number
}

type State = {
  players: Player[]
  seasons: string[]
  recordsBySeason: Map<string, ChartRecord[]>
  chartMode: ChartMode
  selectedSeason: string
  selectedPlayers: string[]
  searchTerm: string
}

type ViewModel = {
  seasonRecords: ChartRecord[]
  selectedRecords: ChartRecord[]
  playerOptions: ChartRecord[]
  hiddenCount: number
  statSummaries: StatSummary[]
  playerColors: Map<string, string>
}

type DomRefs = {
  seasonSelect: HTMLSelectElement
  seasonPlayerCount: HTMLElement
  playerBlock: HTMLElement
  selectionCount: HTMLElement
  selectedChips: HTMLElement
  playerSearch: HTMLInputElement
  playerOptions: HTMLElement
  playerHelper: HTMLElement
  chartEyebrow: HTMLElement
  chartTitle: HTMLElement
  chartHelper: HTMLElement
  chartPlaceholder: HTMLElement
  sideEyebrow: HTMLElement
  sideTitle: HTMLElement
  sideContent: HTMLElement
  chartSvg: SVGSVGElement
  modeButtons: HTMLButtonElement[]
}

const MAX_PLAYERS = 5
const INITIAL_SELECTION_COUNT = 3
const CHART_SIZE = 680
const RINGS = 5
const PALETTE = ['#ff7a45', '#4fb3a2', '#59a4ff', '#ff5f8a', '#b78cff']
const PARALLEL_LINE_COLOR = '#ff9b73'
const PARALLEL_OPACITY = 0.16
const PARALLEL_AXIS_MARGIN = { top: 84, right: 56, bottom: 72, left: 56 }

const STAT_KEYS = [
  'offensive_rebound_percentage',
  'defensive_rebound_percentage',
  'true_shooting_percentage',
  'points',
  'rebounds',
  'assists',
  'assist_percentage',
] as const
const STAT_LABELS: Record<(typeof STAT_KEYS)[number], string> = {
  assist_percentage: 'AST%',
  points: 'Points',
  rebounds: 'Rebounds',
  assists: 'Assists',
  offensive_rebound_percentage: 'OREB%',
  defensive_rebound_percentage: 'DREB%',
  true_shooting_percentage: 'TS%',
}

const app = getApp()

void initializeApp()

async function initializeApp() {
  renderStatus('Preparing the chart', 'Loading player data...')

  try {
    const players = await fetchPlayers()
    const seasons = collectSeasons(players)
    const recordsBySeason = buildSeasonIndex(players)
    const selectedSeason = seasons[0] ?? ''
    const selectedPlayers = pickInitialPlayers(recordsBySeason.get(selectedSeason) ?? [])

    const state: State = {
      players,
      seasons,
      recordsBySeason,
      chartMode: 'spider',
      selectedSeason,
      selectedPlayers,
      searchTerm: '',
    }

    renderAppShell(state)
    const refs = getDomRefs()
    bindControls(state, refs)
    updateView(state, refs)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    renderStatus('Could not load player data', message, true)
  }
}

async function fetchPlayers() {
  const response = await fetch('/players.json')

  if (!response.ok) {
    throw new Error(`Failed to load /players.json (${response.status})`)
  }

  return (await response.json()) as Player[]
}

function collectSeasons(players: Player[]) {
  const seasons = new Set<string>()

  for (const player of players) {
    for (const season of player.seasons) {
      seasons.add(season.season)
    }
  }

  return [...seasons].sort((left, right) => right.localeCompare(left))
}

function buildSeasonIndex(players: Player[]) {
  const recordsBySeason = new Map<string, ChartRecord[]>()

  for (const player of players) {
    for (const season of player.seasons) {
      const records = recordsBySeason.get(season.season) ?? []

      records.push({
        name: player.name,
        season: season.season,
        teamAbbreviation: season.team_abbreviation,
        boxStats: season.box_stats,
      })

      recordsBySeason.set(season.season, records)
    }
  }

  for (const [season, records] of recordsBySeason) {
    recordsBySeason.set(
      season,
      records.sort((left, right) => left.name.localeCompare(right.name)),
    )
  }

  return recordsBySeason
}

function pickInitialPlayers(records: ChartRecord[]) {
  return records.slice(0, INITIAL_SELECTION_COUNT).map((record) => record.name)
}

function renderAppShell(state: State) {
  app.innerHTML = `
    <main class="page-shell">
      <section class="viz-panel">
        <div class="chart-card">
          <div class="card-header">
            <div>
              <p id="chart-eyebrow" class="eyebrow">Spider chart</p>
              <h2 id="chart-title">Season comparison</h2>
            </div>
            <div class="mode-toggle" role="tablist" aria-label="Chart type">
              <button class="toggle-button" type="button" data-chart-mode="spider">Spider</button>
              <button class="toggle-button" type="button" data-chart-mode="parallel">Parallel</button>
            </div>
          </div>
          <div class="chart-frame">
            <svg id="chart-svg" class="chart-svg" viewBox="0 0 ${CHART_SIZE} ${CHART_SIZE}" aria-label="Player stats chart"></svg>
            <div id="chart-placeholder" class="chart-placeholder">
              <p>Select at least one player to render the chart.</p>
            </div>
          </div>
          <p id="chart-helper" class="helper-copy"></p>
        </div>

        <aside class="legend-card">
          <div class="card-header">
            <div>
              <p id="side-eyebrow" class="eyebrow">Selected players</p>
              <h2 id="side-title">Legend</h2>
            </div>
          </div>
          <div id="side-content" class="legend-list"></div>
        </aside>
      </section>

      <section class="controls-panel">
        <div class="control-block">
          <label class="control-label" for="season-select">Season</label>
          <select id="season-select" class="season-select">
            ${state.seasons
              .map((season) => `<option value="${escapeHtml(season)}">${escapeHtml(season)}</option>`)
              .join('')}
          </select>
          <p id="season-player-count" class="helper-copy"></p>
        </div>

        <div id="player-block" class="control-block player-block">
          <div class="label-row">
            <label class="control-label" for="player-search">Players</label>
            <span id="selection-count" class="selection-count"></span>
          </div>
          <div id="selected-chips" class="selected-chips"></div>
          <input
            id="player-search"
            class="player-search"
            type="search"
          />
          <div id="player-options" class="player-options"></div>
          <p id="player-helper" class="helper-copy"></p>
        </div>
      </section>
    </main>
  `
}

function getDomRefs(): DomRefs {
  return {
    seasonSelect: getRequiredElement('#season-select'),
    seasonPlayerCount: getRequiredElement('#season-player-count'),
    playerBlock: getRequiredElement('#player-block'),
    selectionCount: getRequiredElement('#selection-count'),
    selectedChips: getRequiredElement('#selected-chips'),
    playerSearch: getRequiredElement('#player-search'),
    playerOptions: getRequiredElement('#player-options'),
    playerHelper: getRequiredElement('#player-helper'),
    chartEyebrow: getRequiredElement('#chart-eyebrow'),
    chartTitle: getRequiredElement('#chart-title'),
    chartHelper: getRequiredElement('#chart-helper'),
    chartPlaceholder: getRequiredElement('#chart-placeholder'),
    sideEyebrow: getRequiredElement('#side-eyebrow'),
    sideTitle: getRequiredElement('#side-title'),
    sideContent: getRequiredElement('#side-content'),
    chartSvg: getRequiredElement('#chart-svg'),
    modeButtons: [...document.querySelectorAll<HTMLButtonElement>('[data-chart-mode]')],
  }
}

function bindControls(state: State, refs: DomRefs) {
  refs.seasonSelect.addEventListener('change', (event) => {
    const season = (event.target as HTMLSelectElement).value
    const seasonRecords = state.recordsBySeason.get(season) ?? []
    const availablePlayers = new Set(seasonRecords.map((record) => record.name))

    state.selectedSeason = season
    state.searchTerm = ''
    state.selectedPlayers = state.selectedPlayers.filter((player) =>
      availablePlayers.has(player),
    )

    updateView(state, refs)
  })

  refs.modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextMode = button.dataset.chartMode as ChartMode | undefined

      if (!nextMode || nextMode === state.chartMode) {
        return
      }

      state.chartMode = nextMode
      updateView(state, refs)
    })
  })

  refs.playerSearch.addEventListener('input', (event) => {
    state.searchTerm = (event.target as HTMLInputElement).value
    updateView(state, refs)
  })

  refs.playerOptions.addEventListener('click', (event) => {
    if (state.chartMode !== 'spider') {
      return
    }

    const target = event.target as HTMLElement
    const option = target.closest<HTMLElement>('[data-player-name]')

    if (!option) {
      return
    }

    const playerName = option.dataset.playerName

    if (!playerName) {
      return
    }

    togglePlayerSelection(state, playerName)
    updateView(state, refs)
  })

  refs.selectedChips.addEventListener('click', (event) => {
    if (state.chartMode !== 'spider') {
      return
    }

    const target = event.target as HTMLElement
    const removeButton = target.closest<HTMLButtonElement>('[data-remove-player]')

    if (!removeButton) {
      return
    }

    const playerName = removeButton.dataset.removePlayer

    if (!playerName) {
      return
    }

    state.selectedPlayers = state.selectedPlayers.filter((player) => player !== playerName)
    updateView(state, refs)
  })
}

function updateView(state: State, refs: DomRefs) {
  const view = buildViewModel(state)
  const isSpider = state.chartMode === 'spider'

  refs.seasonSelect.value = state.selectedSeason
  refs.seasonPlayerCount.textContent = `${view.seasonRecords.length} players available`
  refs.playerBlock.classList.toggle('is-hidden', !isSpider)

  refs.modeButtons.forEach((button) => {
    const isActive = button.dataset.chartMode === state.chartMode
    button.classList.toggle('is-active', isActive)
    button.setAttribute('aria-pressed', String(isActive))
  })

  refs.chartEyebrow.textContent = isSpider ? 'Spider chart' : 'Parallel coordinates'
  refs.chartTitle.textContent = `${state.selectedSeason || 'Season'} ${isSpider ? 'comparison' : 'distribution'}`
  refs.chartHelper.textContent = isSpider
    ? 'Axis ranges are normalized to the season leaders for each stat.'
    : 'Each line represents one player in the selected season across all seven stats.'

  refs.selectionCount.textContent = `${state.selectedPlayers.length}/${MAX_PLAYERS} selected`
  refs.selectedChips.innerHTML = renderSelectedPlayers(state.selectedPlayers, view.seasonRecords, view.playerColors)

  const placeholder = `Search players in ${state.selectedSeason || 'this season'}`
  refs.playerSearch.placeholder = placeholder
  if (refs.playerSearch.value !== state.searchTerm) {
    refs.playerSearch.value = state.searchTerm
  }

  refs.playerOptions.innerHTML = renderPlayerOptions(view.playerOptions, state.selectedPlayers)
  refs.playerHelper.textContent =
    view.hiddenCount > 0
      ? `Showing the first 16 matches. Refine your search to narrow ${view.hiddenCount} more players.`
      : 'Select up to five players to overlay their season shapes.'

  refs.sideEyebrow.textContent = isSpider ? 'Selected players' : 'Season summary'
  refs.sideTitle.textContent = isSpider ? 'Legend' : 'Ranges and totals'
  refs.sideContent.innerHTML = isSpider
    ? renderSpiderSidePanel(view.selectedRecords, view.playerColors)
    : renderParallelSummary(view.seasonRecords, view.statSummaries)

  if (isSpider) {
    renderSpiderChart(refs.chartSvg, refs.chartPlaceholder, view.seasonRecords, view.selectedRecords, view.playerColors)
    return
  }

  renderParallelChart(refs.chartSvg, refs.chartPlaceholder, view.seasonRecords, view.statSummaries)
}

function buildViewModel(state: State): ViewModel {
  const seasonRecords = state.recordsBySeason.get(state.selectedSeason) ?? []
  const selectedRecords = seasonRecords.filter((record) =>
    state.selectedPlayers.includes(record.name),
  )
  const playerOptions = filterPlayerOptions(seasonRecords, state.searchTerm)
  const hiddenCount = Math.max(0, playerOptions.length - 16)

  const playerColors = new Map(
    state.selectedPlayers.map((name, index) => [name, PALETTE[index]]),
  )

  return {
    seasonRecords,
    selectedRecords,
    playerOptions,
    hiddenCount,
    statSummaries: buildStatSummaries(seasonRecords),
    playerColors,
  }
}

function buildStatSummaries(records: ChartRecord[]) {
  return STAT_KEYS.map((key) => {
    const values = records.map((record) => record.boxStats[key])

    return {
      key,
      min: d3.min(values) ?? 0,
      max: d3.max(values) ?? 0,
    }
  })
}

function togglePlayerSelection(state: State, playerName: string) {
  const existingIndex = state.selectedPlayers.indexOf(playerName)

  if (existingIndex >= 0) {
    state.selectedPlayers.splice(existingIndex, 1)
    return
  }

  if (state.selectedPlayers.length >= MAX_PLAYERS) {
    return
  }

  state.selectedPlayers = [...state.selectedPlayers, playerName]
}

function filterPlayerOptions(records: ChartRecord[], searchTerm: string) {
  const normalizedQuery = searchTerm.trim().toLowerCase()

  if (normalizedQuery.length === 0) {
    return records
  }

  return records.filter((record) =>
    record.name.toLowerCase().includes(normalizedQuery),
  )
}

function renderSelectedPlayers(selectedPlayers: string[], records: ChartRecord[], playerColors: Map<string, string>) {
  if (selectedPlayers.length === 0) {
    return '<p class="empty-copy">No players selected.</p>'
  }

  const teamByPlayer = new Map(records.map((record) => [record.name, record.teamAbbreviation]))

  return selectedPlayers
    .map((player) => {
      const team = teamByPlayer.get(player) ?? 'N/A'
      const color = playerColors.get(player) ?? PALETTE[0]

      return `
        <button class="chip" type="button" data-remove-player="${escapeHtml(player)}">
          <span class="chip-swatch" style="background:${color}"></span>
          <span>${escapeHtml(player)}</span>
          <span class="chip-team">${escapeHtml(team)}</span>
          <span class="chip-remove" aria-hidden="true">×</span>
        </button>
      `
    })
    .join('')
}

function renderPlayerOptions(records: ChartRecord[], selectedPlayers: string[]) {
  if (records.length === 0) {
    return '<p class="empty-copy">No players match this search.</p>'
  }

  return records
    .slice(0, 16)
    .map((record) => renderPlayerOption(record, selectedPlayers))
    .join('')
}

function renderPlayerOption(record: ChartRecord, selectedPlayers: string[]) {
  const isSelected = selectedPlayers.includes(record.name)
  const isDisabled = !isSelected && selectedPlayers.length >= MAX_PLAYERS

  return `
    <button
      class="player-option${isSelected ? ' is-selected' : ''}"
      type="button"
      data-player-name="${escapeHtml(record.name)}"
      ${isDisabled ? 'disabled' : ''}
    >
      <span>${escapeHtml(record.name)}</span>
      <span class="option-team">${escapeHtml(record.teamAbbreviation)}</span>
    </button>
  `
}

function renderSpiderSidePanel(selectedRecords: ChartRecord[], playerColors: Map<string, string>) {
  if (selectedRecords.length === 0) {
    return '<p class="empty-copy">No player selected yet.</p>'
  }

  return selectedRecords
    .map((record) => renderLegendItem(record, playerColors.get(record.name) ?? PALETTE[0]))
    .join('')
}

function renderLegendItem(record: ChartRecord, color: string) {
  return `
    <article class="legend-item">
      <div class="legend-heading">
        <div class="legend-player">
          <span class="legend-swatch" style="background:${color}"></span>
          <div>
            <h3>${escapeHtml(record.name)}</h3>
            <p>${escapeHtml(record.teamAbbreviation)} • ${escapeHtml(record.season)}</p>
          </div>
        </div>
      </div>
    </article>
  `
}

function renderParallelSummary(records: ChartRecord[], statSummaries: StatSummary[]) {
  if (records.length === 0) {
    return '<p class="empty-copy">No data available for this season.</p>'
  }

  return `
    <article>
      <dl class="summary-grid">
        <div>
          <dt>Players</dt>
          <dd>${records.length}</dd>
        </div>
      </dl>
      <dl class="stat-grid stat-grid-parallel">
        ${statSummaries
          .map(
            (summary) => `
              <div>
                <dt>${STAT_LABELS[summary.key]}</dt>
                <dd>${formatStatRange(summary)}</dd>
              </div>
            `,
          )
          .join('')}
      </dl>
    </article>
  `
}

function renderSpiderChart(
  svgElement: SVGSVGElement,
  placeholder: HTMLElement,
  seasonRecords: ChartRecord[],
  selectedRecords: ChartRecord[],
  playerColors: Map<string, string>,
) {
  const svg = d3.select(svgElement)
  svg.selectAll('*').remove()

  placeholder.classList.toggle('hidden', selectedRecords.length > 0)
  placeholder.innerHTML = '<p>Select at least one player to render the chart.</p>'

  if (selectedRecords.length === 0) {
    return
  }

  const center = CHART_SIZE / 2
  const radius = CHART_SIZE * 0.27

  const layer = svg
    .append('g')
    .attr('transform', `translate(${center}, ${center})`)

  const maxByStat = Object.fromEntries(
    STAT_KEYS.map((key) => [
      key,
      d3.max(seasonRecords, (record) => record.boxStats[key]) ?? 1,
    ]),
  ) as Record<(typeof STAT_KEYS)[number], number>

  for (let ring = RINGS; ring >= 1; ring -= 1) {
    const ringRadius = (radius * ring) / RINGS
    const ringPoints = STAT_KEYS.map((_, index) =>
      polarToCartesian(angleForIndex(index), ringRadius),
    )

    layer
      .append('path')
      .attr('d', closePath(ringPoints))
      .attr('class', 'grid-ring')
  }

  STAT_KEYS.forEach((key, index) => {
    const labelPoint = polarToCartesian(angleForIndex(index), radius + 56)
    const axisEnd = polarToCartesian(angleForIndex(index), radius)

    layer
      .append('line')
      .attr('x1', 0)
      .attr('y1', 0)
      .attr('x2', axisEnd.x)
      .attr('y2', axisEnd.y)
      .attr('class', 'axis-line')

    layer
      .append('text')
      .attr('x', labelPoint.x)
      .attr('y', labelPoint.y)
      .attr('class', 'axis-label')
      .attr('text-anchor', labelAnchor(index))
      .attr('dominant-baseline', labelBaseline(index))
      .text(STAT_LABELS[key])

    layer
      .append('text')
      .attr('x', axisEnd.x * 0.98)
      .attr('y', axisEnd.y * 0.98)
      .attr('class', 'axis-max')
      .attr('text-anchor', labelAnchor(index))
      .attr('dominant-baseline', labelBaseline(index))
      .text(formatStatValue(key, maxByStat[key]))
  })

  selectedRecords.forEach((record) => {
    const color = playerColors.get(record.name) ?? PALETTE[0]
    const points = STAT_KEYS.map((key, statIndex) => {
      const maxValue = maxByStat[key]
      const value = record.boxStats[key]
      const scaledRadius = maxValue > 0 ? (value / maxValue) * radius : 0

      return polarToCartesian(angleForIndex(statIndex), scaledRadius)
    })

    layer
      .append('path')
      .attr('d', closePath(points))
      .attr('fill', color)
      .attr('fill-opacity', 0.15)
      .attr('stroke', color)
      .attr('stroke-width', 3)

    layer
      .selectAll(`.point-${record.name.replace(/\s+/g, '-')}`)
      .data(points)
      .enter()
      .append('circle')
      .attr('cx', (point) => point.x)
      .attr('cy', (point) => point.y)
      .attr('r', 5)
      .attr('fill', color)
      .attr('stroke', '#fffaf1')
      .attr('stroke-width', 2)
  })
}

function renderParallelChart(
  svgElement: SVGSVGElement,
  placeholder: HTMLElement,
  seasonRecords: ChartRecord[],
  statSummaries: StatSummary[],
) {
  const svg = d3.select(svgElement)
  svg.selectAll('*').remove()

  placeholder.classList.toggle('hidden', seasonRecords.length > 0)
  placeholder.innerHTML = '<p>No player data available for this season.</p>'

  if (seasonRecords.length === 0) {
    return
  }

  const width = CHART_SIZE
  const height = CHART_SIZE
  const xScale = d3
    .scalePoint<(typeof STAT_KEYS)[number]>()
    .domain(STAT_KEYS)
    .range([PARALLEL_AXIS_MARGIN.left, width - PARALLEL_AXIS_MARGIN.right])

  const yScales = new Map<(typeof STAT_KEYS)[number], d3.ScaleLinear<number, number>>()

  statSummaries.forEach((summary) => {
    const domainMin = summary.min
    const domainMax = summary.max === summary.min ? summary.max + 1 : summary.max

    yScales.set(
      summary.key,
      d3
        .scaleLinear()
        .domain([domainMin, domainMax])
        .range([height - PARALLEL_AXIS_MARGIN.bottom, PARALLEL_AXIS_MARGIN.top]),
    )
  })

  const layer = svg.append('g')
  const line = d3
    .line<[number, number]>()
    .x((point) => point[0])
    .y((point) => point[1])

  const grid = layer.append('g').attr('class', 'parallel-grid')

  STAT_KEYS.forEach((key) => {
    const x = xScale(key)
    const yScale = yScales.get(key)
    const summary = statSummaries.find((item) => item.key === key)

    if (x === undefined || yScale === undefined || summary === undefined) {
      return
    }

    grid
      .append('line')
      .attr('class', 'parallel-axis-line')
      .attr('x1', x)
      .attr('x2', x)
      .attr('y1', PARALLEL_AXIS_MARGIN.top)
      .attr('y2', height - PARALLEL_AXIS_MARGIN.bottom)

    grid
      .append('text')
      .attr('class', 'parallel-axis-label')
      .attr('x', x)
      .attr('y', PARALLEL_AXIS_MARGIN.top - 26)
      .attr('text-anchor', 'middle')
      .text(STAT_LABELS[key])

    grid
      .append('text')
      .attr('class', 'parallel-axis-value')
      .attr('x', x)
      .attr('y', PARALLEL_AXIS_MARGIN.top - 8)
      .attr('text-anchor', 'middle')
      .text(formatStatValue(key, summary.max))

    grid
      .append('text')
      .attr('class', 'parallel-axis-value')
      .attr('x', x)
      .attr('y', height - PARALLEL_AXIS_MARGIN.bottom + 26)
      .attr('text-anchor', 'middle')
      .text(formatStatValue(key, summary.min))

    yScale.ticks(4).forEach((tick) => {
      grid
        .append('line')
        .attr('class', 'parallel-tick')
        .attr('x1', x - 7)
        .attr('x2', x + 7)
        .attr('y1', yScale(tick))
        .attr('y2', yScale(tick))
    })
  })

  const lines = layer.append('g').attr('class', 'parallel-lines')

  seasonRecords.forEach((record) => {
    const points = STAT_KEYS.map((key) => {
      const x = xScale(key)
      const yScale = yScales.get(key)

      if (x === undefined || yScale === undefined) {
        return null
      }

      return [x, yScale(record.boxStats[key])] as [number, number]
    }).filter((point): point is [number, number] => point !== null)

    lines
      .append('path')
      .attr('d', line(points) ?? '')
      .attr('fill', 'none')
      .attr('stroke', PARALLEL_LINE_COLOR)
      .attr('stroke-opacity', PARALLEL_OPACITY)
      .attr('stroke-width', 1.3)
  })
}

function angleForIndex(index: number) {
  return -Math.PI / 2 + (index * Math.PI * 2) / STAT_KEYS.length
}

function polarToCartesian(angle: number, radius: number) {
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  }
}

function closePath(points: Array<{ x: number; y: number }>) {
  const line = d3
    .line<{ x: number; y: number }>()
    .x((point) => point.x)
    .y((point) => point.y)

  const closedPoints = [...points, points[0]]
  return line(closedPoints) ?? ''
}

function labelAnchor(index: number) {
  const point = polarToCartesian(angleForIndex(index), 1)

  if (Math.abs(point.x) < 0.2) {
    return 'middle'
  }

  return point.x > 0 ? 'start' : 'end'
}

function labelBaseline(index: number) {
  const point = polarToCartesian(angleForIndex(index), 1)

  if (point.y < -0.75) {
    return 'auto'
  }

  if (point.y > 0.75) {
    return 'hanging'
  }

  return 'middle'
}

function formatStatValue(
  key: (typeof STAT_KEYS)[number],
  value: number,
) {
  if (
    key === 'offensive_rebound_percentage' ||
    key === 'defensive_rebound_percentage' ||
    key === 'true_shooting_percentage' ||
    key === 'assist_percentage'
  ) {
    return `${(value * 100).toFixed(1)}%`
  }

  return value.toFixed(1)
}

function formatStatRange(summary: StatSummary) {
  return `${formatStatValue(summary.key, summary.min)} - ${formatStatValue(summary.key, summary.max)}`
}

function renderStatus(title: string, message: string, isError = false) {
  app.innerHTML = `
    <main class="page-shell">
      <section class="status-panel${isError ? ' error-panel' : ''}">
        <p class="eyebrow">${isError ? 'Data unavailable' : 'NBA box score explorer'}</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="lede">${escapeHtml(message)}</p>
      </section>
    </main>
  `
}

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getApp() {
  const element = document.querySelector<HTMLDivElement>('#app')

  if (!element) {
    throw new Error('App container not found')
  }

  return element
}

function getRequiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)

  if (!element) {
    throw new Error(`Missing required element: ${selector}`)
  }

  return element
}
