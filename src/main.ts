import * as d3 from 'd3'
import './style.css'

type BoxStats = {
  games_played: number
  points: number
  rebounds: number
  assists: number
}

type SeasonStats = {
  season: string
  team_abbreviation: string
  box_stats: BoxStats
}

type Player = {
  name: string
  seasons: SeasonStats[]
}

type ChartRecord = {
  name: string
  season: string
  teamAbbreviation: string
  boxStats: BoxStats
}

type State = {
  players: Player[]
  seasons: string[]
  recordsBySeason: Map<string, ChartRecord[]>
  selectedSeason: string
  selectedPlayers: string[]
  searchTerm: string
}

type ViewModel = {
  seasonRecords: ChartRecord[]
  selectedRecords: ChartRecord[]
  playerOptions: ChartRecord[]
  hiddenCount: number
}

type DomRefs = {
  seasonSelect: HTMLSelectElement
  seasonPlayerCount: HTMLElement
  selectionCount: HTMLElement
  selectedChips: HTMLElement
  playerSearch: HTMLInputElement
  playerOptions: HTMLElement
  playerHelper: HTMLElement
  chartTitle: HTMLElement
  chartPlaceholder: HTMLElement
  legendList: HTMLElement
  radarChart: SVGSVGElement
}

const MAX_PLAYERS = 5
const INITIAL_SELECTION_COUNT = 3
const CHART_SIZE = 680
const RINGS = 5
const PALETTE = ['#ff6b35', '#157a6e', '#3a86ff', '#ef476f', '#6a4c93']

const STAT_KEYS = ['games_played', 'points', 'rebounds', 'assists'] as const
const STAT_LABELS: Record<(typeof STAT_KEYS)[number], string> = {
  games_played: 'Games',
  points: 'Points',
  rebounds: 'Rebounds',
  assists: 'Assists',
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
              <p class="eyebrow">Radar chart</p>
              <h2 id="chart-title">Season comparison</h2>
            </div>
          </div>
          <div class="chart-frame">
            <svg id="radar-chart" class="radar-chart" viewBox="0 0 ${CHART_SIZE} ${CHART_SIZE}" aria-label="Player spider chart"></svg>
            <div id="chart-placeholder" class="chart-placeholder">
              <p>Select at least one player to render the chart.</p>
            </div>
          </div>
          <p class="helper-copy">
            Axis ranges are normalized to the season leaders for each stat.
          </p>
        </div>

        <aside class="legend-card">
          <div class="card-header">
            <div>
              <p class="eyebrow">Selected players</p>
              <h2>Legend and values</h2>
            </div>
          </div>
          <div id="legend-list" class="legend-list"></div>
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

        <div class="control-block player-block">
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
    selectionCount: getRequiredElement('#selection-count'),
    selectedChips: getRequiredElement('#selected-chips'),
    playerSearch: getRequiredElement('#player-search'),
    playerOptions: getRequiredElement('#player-options'),
    playerHelper: getRequiredElement('#player-helper'),
    chartTitle: getRequiredElement('#chart-title'),
    chartPlaceholder: getRequiredElement('#chart-placeholder'),
    legendList: getRequiredElement('#legend-list'),
    radarChart: getRequiredElement('#radar-chart'),
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

  refs.playerSearch.addEventListener('input', (event) => {
    state.searchTerm = (event.target as HTMLInputElement).value
    updateView(state, refs)
  })

  refs.playerOptions.addEventListener('click', (event) => {
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

  refs.seasonSelect.value = state.selectedSeason
  refs.seasonPlayerCount.textContent = `${view.seasonRecords.length} players available`
  refs.selectionCount.textContent = `${state.selectedPlayers.length}/${MAX_PLAYERS} selected`
  refs.selectedChips.innerHTML = renderSelectedPlayers(state.selectedPlayers, view.seasonRecords)

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

  refs.chartTitle.textContent = state.selectedSeason || 'Season comparison'
  refs.legendList.innerHTML =
    view.selectedRecords.length > 0
      ? view.selectedRecords
          .map((record, index) => renderLegendItem(record, PALETTE[index]))
          .join('')
      : '<p class="empty-copy">No player selected yet.</p>'

  renderRadarChart(refs.radarChart, refs.chartPlaceholder, view.seasonRecords, view.selectedRecords)
}

function buildViewModel(state: State): ViewModel {
  const seasonRecords = state.recordsBySeason.get(state.selectedSeason) ?? []
  const selectedRecords = seasonRecords.filter((record) =>
    state.selectedPlayers.includes(record.name),
  )
  const playerOptions = filterPlayerOptions(seasonRecords, state.searchTerm)
  const hiddenCount = Math.max(0, playerOptions.length - 16)

  return {
    seasonRecords,
    selectedRecords,
    playerOptions,
    hiddenCount,
  }
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

function renderSelectedPlayers(selectedPlayers: string[], records: ChartRecord[]) {
  if (selectedPlayers.length === 0) {
    return '<p class="empty-copy">No players selected.</p>'
  }

  const teamByPlayer = new Map(records.map((record) => [record.name, record.teamAbbreviation]))

  return selectedPlayers
    .map((player, index) => {
      const team = teamByPlayer.get(player) ?? 'N/A'

      return `
        <button class="chip" type="button" data-remove-player="${escapeHtml(player)}">
          <span class="chip-swatch" style="background:${PALETTE[index]}"></span>
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
      <dl class="stat-grid">
        ${STAT_KEYS.map((key) => `<div><dt>${STAT_LABELS[key]}</dt><dd>${formatStatValue(key, record.boxStats[key])}</dd></div>`).join('')}
      </dl>
    </article>
  `
}

function renderRadarChart(
  svgElement: SVGSVGElement,
  placeholder: HTMLElement,
  seasonRecords: ChartRecord[],
  selectedRecords: ChartRecord[],
) {
  const svg = d3.select(svgElement)
  svg.selectAll('*').remove()

  placeholder.classList.toggle('hidden', selectedRecords.length > 0)

  if (selectedRecords.length === 0) {
    return
  }

  const center = CHART_SIZE / 2
  const radius = CHART_SIZE * 0.31

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
    const labelPoint = polarToCartesian(angleForIndex(index), radius + 48)
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

  selectedRecords.forEach((record, index) => {
    const color = PALETTE[index]
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
      .selectAll(`.point-${index}`)
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
  if (index === 0) {
    return 'middle'
  }

  return index === 1 ? 'start' : index === 3 ? 'end' : 'middle'
}

function labelBaseline(index: number) {
  if (index === 0) {
    return 'auto'
  }

  return index === 2 ? 'hanging' : 'middle'
}

function formatStatValue(
  key: (typeof STAT_KEYS)[number],
  value: number,
) {
  if (key === 'games_played') {
    return Math.round(value).toString()
  }

  return value.toFixed(1)
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
