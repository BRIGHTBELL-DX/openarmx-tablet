// OpenArmX A2 — Control Tablet  |  app.js

// ── Mock Data ────────────────────────────────────────────────
const MOCK_FILES = [
  {
    id: 'f1', name: 'Greeting Wave', version: 'v3', tag: 'performance',
    duration: 42, poses: 128,
    yaml: 'greeting_wave_v3.yaml', music: 'intro_fanfare.mp3',
    date: '2026-05-10', size: '184 KB',
    versions: [
      { ver: 'v3', date: '2026-05-10', active: true },
      { ver: 'v2', date: '2026-04-22', active: false },
      { ver: 'v1', date: '2026-04-01', active: false },
    ]
  },
  {
    id: 'f2', name: 'Dance Routine Alpha', version: 'v2', tag: 'performance',
    duration: 180, poses: 512,
    yaml: 'dance_alpha_v2.yaml', music: 'bpm130_track.mp3',
    date: '2026-05-09', size: '1.2 MB',
    versions: [
      { ver: 'v2', date: '2026-05-09', active: true },
      { ver: 'v1', date: '2026-04-15', active: false },
    ]
  },
  {
    id: 'f3', name: 'Expo Demo Loop', version: 'v1', tag: 'demo',
    duration: 95, poses: 230,
    yaml: 'expo_demo_loop.yaml', music: 'ambient_loop.wav',
    date: '2026-05-08', size: '620 KB',
    versions: [{ ver: 'v1', date: '2026-05-08', active: true }]
  },
  {
    id: 'f4', name: 'Joint Range Test', version: 'v1', tag: 'test',
    duration: 30, poses: 64,
    yaml: 'joint_test_v1.yaml', music: null,
    date: '2026-05-07', size: '48 KB',
    versions: [{ ver: 'v1', date: '2026-05-07', active: true }]
  },
  {
    id: 'f5', name: 'Grand Finale Bow', version: 'v2', tag: 'performance',
    duration: 58, poses: 176,
    yaml: 'finale_bow_v2.yaml', music: 'fanfare_end.mp3',
    date: '2026-05-06', size: '310 KB',
    versions: [
      { ver: 'v2', date: '2026-05-06', active: true },
      { ver: 'v1', date: '2026-04-28', active: false },
    ]
  },
];

// ── Playback State ───────────────────────────────────────────
const state = {
  currentScreen: 'safety',
  selectedFileId: null,
  loadedFile: null,
  searchQuery: '',
  sortBy: 'date',

  isPlaying: false,
  progress: 0,
  currentTime: 0,
  totalTime: 0,
  speed: 1.0,

  robotState: 'IDLE',
  maxTemp: null,
  todayRuntime: 0,   // minutes
  connected: false,

  _playTimer: null,
};

// ── Playlist State ───────────────────────────────────────────
const playlist = {
  items: [],      // { id, fileId, name, duration, poses, music, intervalSec, intervalPose, intervalTempBased, enabled }
  loop: false,
  currentIndex: -1,
  isRunning: false,
  _intervalTimer: null,
  _drag: { fromId: null },
};

// ── Load Management State ────────────────────────────────────
const loadMgmt = {
  warnTempC: 55,
  skipTempC: 65,
  autoCooldownSec: 90,
  maxDailyMinutes: 120,
};

// ── Helpers ──────────────────────────────────────────────────
function fmtTime(sec) {
  if (sec == null || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtSec(sec) {
  if (sec < 60) return `${sec}초`;
  return `${Math.floor(sec / 60)}분 ${sec % 60}초`;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// ── WebSocket (mock) ─────────────────────────────────────────
function initWS() {
  setTimeout(() => {
    state.connected = true;
    updateConnStatus(true);
    setInterval(pushFakeTelemetry, 2000);
  }, 1200);
}

function pushFakeTelemetry() {
  if (!state.connected) return;
  state.todayRuntime += 2 / 60;
  pushFakeTelemetryJoints();
  updateTempUI();
  updateLoadMgmtStatus();
}

// ── Navigation ───────────────────────────────────────────────
function nav(screen) {
  if (state.currentScreen === screen) return;
  state.currentScreen = screen;
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`screen-${screen}`).classList.add('active');
  document.querySelector(`[data-screen="${screen}"]`).classList.add('active');
  if (screen === 'playlist') {
    renderPlaylist();
    updatePlaylistPreview();
    renderTimeline();
  }
  if (screen === 'monitor') {
    initMonitorScreen();
    renderMonitor();
  }
  if (screen === 'safety') {
    initSafetyScreen();
  }
}

function updateConnStatus(ok) {
  document.getElementById('connDot').classList.toggle('connected', ok);
  document.getElementById('connDot').classList.toggle('error', !ok);
  document.getElementById('connLabel').textContent = ok ? '연결됨' : '연결 끊김';
}

// ── File Management ──────────────────────────────────────────
function renderFileList() {
  const list = document.getElementById('fileList');
  const files = getFilteredFiles();
  document.getElementById('fileCount').textContent = files.length;
  list.innerHTML = '';

  if (!files.length) {
    list.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-faint)">파일 없음</div>';
    return;
  }
  files.forEach(f => {
    const item = document.createElement('div');
    item.className = 'file-item' + (state.selectedFileId === f.id ? ' selected' : '');
    item.onclick = () => selectFile(f.id);
    item.innerHTML = `
      <span class="file-item-icon">🎭</span>
      <div class="file-item-body">
        <div class="file-item-name">${f.name}</div>
        <div class="file-item-meta">
          <span>⏱ ${fmtTime(f.duration)}</span>
          <span>📐 ${f.poses} poses</span>
          <span>${f.music ? '🎵 ' + f.music : '🔇 음악 없음'}</span>
        </div>
      </div>
      <div class="file-item-right">
        <span class="file-ver-badge">${f.version}</span>
      </div>`;
    list.appendChild(item);
  });
}

function getFilteredFiles() {
  let files = [...MOCK_FILES];
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    files = files.filter(f =>
      f.name.toLowerCase().includes(q) || f.yaml.toLowerCase().includes(q));
  }
  if (state.sortBy === 'name')     files.sort((a, b) => a.name.localeCompare(b.name));
  if (state.sortBy === 'duration') files.sort((a, b) => b.duration - a.duration);
  return files;
}

function selectFile(id) {
  state.selectedFileId = id;
  renderFileList();
  renderFileDetail();
}

function renderFileDetail() {
  const f = MOCK_FILES.find(x => x.id === state.selectedFileId);
  document.getElementById('detailEmpty').classList.toggle('hidden', !!f);
  document.getElementById('detailContent').classList.toggle('hidden', !f);
  if (!f) return;

  document.getElementById('detailName').textContent    = f.name;
  document.getElementById('detailVersion').textContent = `최신: ${f.version}`;
  document.getElementById('metaDuration').textContent  = fmtTime(f.duration);
  document.getElementById('metaPoses').textContent     = `${f.poses}개`;
  document.getElementById('metaYaml').textContent      = f.yaml;
  document.getElementById('metaMusic').textContent     = f.music || '—';
  document.getElementById('metaDate').textContent      = f.date;
  document.getElementById('metaSize').textContent      = f.size;

}

function filterFiles() {
  state.searchQuery = document.getElementById('fileSearch').value;
  renderFileList();
}

function sortFiles(val) { state.sortBy = val; renderFileList(); }

function loadAndPlay() {
  const f = MOCK_FILES.find(x => x.id === state.selectedFileId);
  if (!f) return;
  loadFile(f);
  // 인라인 플레이어 표시 + 바로 재생
  showDetailPlayer(true);
  setTimeout(() => togglePlay(), 100);
}

/* 파일 상세 인라인 플레이어 표시/숨김
   show=true  → 인라인 플레이어 표시, 바로 재생 버튼 비활성, NOW PLAYING 바 숨김
   show=false → 인라인 플레이어 숨김, 바로 재생 버튼 복원 */
function showDetailPlayer(show) {
  const player = document.getElementById('detailPlayer');
  const playBtn = document.getElementById('detailPlayBtn');
  if (!player || !playBtn) return;
  player.classList.toggle('hidden', !show);
  playBtn.disabled = show;
  if (show) {
    playBtn.classList.add('dp-hidden-btn');
  } else {
    playBtn.classList.remove('dp-hidden-btn');
    playBtn.disabled = false;
  }
}

function loadToPlayer() {
  const f = MOCK_FILES.find(x => x.id === state.selectedFileId);
  if (!f) return;
  loadFile(f);
  nav('play');
}

function loadFile(f) {
  state.loadedFile  = f;
  state.totalTime   = f.duration;
  state.currentTime = 0;
  state.progress    = 0;
  state.isPlaying   = false;

  document.getElementById('loadedEmpty').classList.add('hidden');
  document.getElementById('loadedInfo').classList.remove('hidden');
  document.getElementById('loadedName').textContent  = f.name;
  document.getElementById('loadedFiles').textContent =
    `${f.yaml}  +  ${f.music || '(음악 없음)'}  ·  로봇 PC에서 재생`;

  updateProgressUI();
  updatePlayUI();
}

function deleteFile()  { }

function addToPlaylist() {
  const f = MOCK_FILES.find(x => x.id === state.selectedFileId);
  if (!f) return;
  plAddFile(f);
}

// ── Playback ─────────────────────────────────────────────────
function togglePlay() {
  if (!state.loadedFile) return;
  state.isPlaying ? pausePlayback() : startPlayback();
}

function startPlayback() {
  state.isPlaying  = true;
  state.robotState = 'PLAYING';
  clearInterval(state._playTimer);

  // POST /api/play → { yaml, music, speed }

  const tick = 200;
  state._playTimer = setInterval(() => {
    state.currentTime += (tick / 1000) * state.speed;

    if (state.currentTime >= state.totalTime) {
      state.currentTime = state.totalTime;
      stopPlayback();
      return;
    }
    state.progress = (state.currentTime / state.totalTime) * 100;
    updateProgressUI();
  }, tick);

  updatePlayUI();
}

function pausePlayback() {
  state.isPlaying  = false;
  state.robotState = 'PAUSED';
  clearInterval(state._playTimer);
  updatePlayUI();
}

function stop() { stopPlayback(); }

function stopPlayback() {
  state.isPlaying   = false;
  state.robotState  = 'IDLE';
  state.currentTime = 0;
  state.progress    = 0;
  clearInterval(state._playTimer);
  updateProgressUI();
  updatePlayUI();
  // 인라인 플레이어 닫기 + 바로 재생 버튼 복원
  showDetailPlayer(false);
  // 재생 완료 후 로드 상태 초기화 (파일 상세 패널은 유지)
  state.loadedFile = null;
}

function seekTo(sec) {
  state.currentTime = Math.max(0, Math.min(sec, state.totalTime));
  state.progress    = (state.currentTime / state.totalTime) * 100;
  updateProgressUI();
}

function seekRel(delta) { seekTo(state.currentTime + delta); }

function seek(event) {
  if (!state.loadedFile) return;
  const wrap = document.getElementById('progressWrap');
  const rect  = wrap.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  seekTo(ratio * state.totalTime);
}

// Speed — controls BOTH motion and music on robot PC
function setSpeed(val) {
  state.speed = val;
  document.getElementById('speedVal').textContent  = `${val.toFixed(2)}x`;
  document.getElementById('speedSlider').value     = Math.round(val * 100);
  document.getElementById('psSpeed').textContent   = `${val.toFixed(2)}x`;
  document.querySelectorAll('.speed-preset').forEach(btn =>
    btn.classList.toggle('active', parseFloat(btn.textContent) === val));
}

function setSpeedSlider(val) { setSpeed(parseInt(val) / 100); }

// ── UI Updates ───────────────────────────────────────────────
function updateProgressUI() {
  document.getElementById('progressFill').style.width = `${state.progress}%`;
  document.getElementById('progressHead').style.left  = `${state.progress}%`;
  document.getElementById('timeCurrent').textContent  = fmtTime(state.currentTime);
  document.getElementById('timeTotal').textContent    = fmtTime(state.totalTime);
  const timeStr = `${fmtTime(state.currentTime)} / ${fmtTime(state.totalTime)}`;
  // 인라인 플레이어 진행률 동기화
  const dpFill = document.getElementById('dpProgressFill');
  const dpTime = document.getElementById('dpTime');
  if (dpFill) dpFill.style.width = `${state.progress}%`;
  if (dpTime)  dpTime.textContent = timeStr;
}

function updatePlayUI() {
  const playing = state.isPlaying;
  document.getElementById('playPauseIcon').textContent = playing ? '⏸' : '▶';
  // 인라인 플레이어 라이브 닷 + 라벨 동기화
  const dpLabel   = document.getElementById('dpLabel');
  const dpLiveDot = document.getElementById('dpLiveDot');
  if (dpLabel)   dpLabel.textContent = playing ? '재생 중' : '일시정지';
  if (dpLiveDot) dpLiveDot.classList.toggle('dp-paused', !playing);

  const pill  = document.getElementById('playStatusPill');
  const badge = document.getElementById('robotStateBadge');
  const map   = {
    PLAYING: { cls: 'playing', label: '재생 중',   badgeCls: 'playing' },
    PAUSED:  { cls: 'paused',  label: '일시 정지', badgeCls: '' },
    IDLE:    { cls: '',        label: '대기 중',   badgeCls: '' },
  };
  const s = map[state.robotState] ?? map.IDLE;
  pill.className  = `status-pill ${s.cls}`;
  pill.textContent = s.label;
  badge.className  = `robot-state-badge ${s.badgeCls}`;
  badge.textContent = state.robotState;
}

function updateTempUI() {
  const t   = state.maxTemp;
  const val = t != null ? `${t.toFixed(1)}°C` : '—°C';
  const cls = t == null ? '' : t > loadMgmt.skipTempC ? 'temp-hot' : t > loadMgmt.warnTempC ? 'temp-warn' : 'temp-ok';

  document.getElementById('tqVal').textContent = val;
  const ps = document.getElementById('psMaxTemp');
  ps.textContent = val;
  ps.className   = `ps-big ${cls}`;

  const m = Math.floor(state.todayRuntime);
  document.getElementById('psTotalTime').textContent = `${Math.floor(m/60)}h ${m%60}m`;
}

// ── Modals ───────────────────────────────────────────────────
function showModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// ════════════════════════════════════════════════════════════
// PLAYLIST
// ════════════════════════════════════════════════════════════

function plAddFile(f) {
  playlist.items.push({
    id: uid(),
    fileId: f.id,
    name: f.name,
    duration: f.duration,
    poses: f.poses,
    music: f.music,
    intervalSec: 30,
    intervalPose: 'home',
    intervalTempBased: false,
    enabled: true,
  });
  renderPlaylist();
  updatePlaylistPreview();
  renderTimeline();
  updatePlTotalTime();
}

function renderPlaylist() {
  const queue   = document.getElementById('plQueue');
  const empty   = document.getElementById('plQueueEmpty');
  const count   = document.getElementById('plCount');
  const items   = playlist.items;

  count.textContent = items.length;

  if (!items.length) {
    empty.style.display = 'flex';
    // clear non-empty children (keep the empty div)
    [...queue.children].forEach(c => { if (c !== empty) c.remove(); });
    return;
  }
  empty.style.display = 'none';

  // Rebuild
  [...queue.children].forEach(c => { if (c !== empty) c.remove(); });

  items.forEach((item, idx) => {
    // Item row
    const row = document.createElement('div');
    row.className = 'pl-item' + (item.enabled ? '' : ' disabled');
    row.draggable = true;
    row.dataset.id = item.id;
    row.innerHTML = `
      <div class="pl-drag-handle">⠿</div>
      <div class="pl-item-num">${idx + 1}</div>
      <div class="pl-item-main">
        <div class="pl-item-name">${item.name}</div>
        <div class="pl-item-meta">⏱ ${fmtTime(item.duration)} · 📐 ${item.poses} poses · ${item.music ? '🎵 ' + item.music : '🔇 음악 없음'}</div>
      </div>
      <div class="pl-item-actions">
        <label class="toggle-wrap" title="${item.enabled ? '활성' : '비활성'}">
          <input type="checkbox" ${item.enabled ? 'checked' : ''} onchange="App.togglePlItem('${item.id}')" />
          <span class="toggle"></span>
        </label>
        <button class="pl-remove-btn" onclick="App.removePlItem('${item.id}')">✕</button>
      </div>`;

    row.addEventListener('dragstart', e => plDragStart(e, item.id));
    row.addEventListener('dragover',  e => { e.preventDefault(); row.classList.add('drag-over'); });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop',      e => plDropOnItem(e, item.id));
    queue.appendChild(row);

    // Interval block: 아이템 사이, 또는 마지막 아이템 뒤(루프 ON일 때)
    const isLast = idx === items.length - 1;
    if (!isLast || playlist.loop) {
      const iBlock = document.createElement('div');
      iBlock.className = 'pl-interval-block';
      iBlock.dataset.afterId = item.id;
      const loopLabel = isLast
        ? `<span class="pl-int-loop-badge">↩ 루프 후 휴식</span>`
        : `<span class="pl-int-label">인터벌</span>`;
      iBlock.innerHTML = `
        <div class="pl-interval-line-wrap">
          <div class="pl-int-line"></div>
          <div class="pl-interval-content ${isLast ? 'pl-interval-loop' : ''}">
            <span class="pl-int-icon">${isLast ? '↩' : '⏸'}</span>
            ${loopLabel}
            <input class="pl-int-input" type="number" value="${item.intervalSec}" min="0" max="600"
                   onchange="App.setPlInterval('${item.id}', this.value)" />
            <span class="pl-int-unit">초</span>
            <select class="pl-int-pose" onchange="App.setPlPose('${item.id}', this.value)">
              <option value="home"   ${item.intervalPose === 'home'   ? 'selected' : ''}>홈 포즈</option>
              <option value="wave"   ${item.intervalPose === 'wave'   ? 'selected' : ''}>웨이브 대기</option>
              <option value="rest"   ${item.intervalPose === 'rest'   ? 'selected' : ''}>휴식 포즈</option>
              <option value="custom" ${item.intervalPose === 'custom' ? 'selected' : ''}>커스텀</option>
            </select>
            <label class="toggle-wrap" title="온도가 기준 이하로 내려갈 때까지 추가 대기">
              <input type="checkbox" ${item.intervalTempBased ? 'checked' : ''}
                     onchange="App.setPlIntervalTempBased('${item.id}', this.checked)" />
              <span class="toggle"></span>
              <span>온도 냉각 후</span>
            </label>
            ${item.intervalTempBased ? `<span class="pl-int-temp-badge active">≤ ${loadMgmt.warnTempC}°C 대기</span>` : ''}
          </div>
        </div>`;
      queue.appendChild(iBlock);
    }
  });

  updatePlTotalTime();
}

// Drag & Drop
function plDragStart(e, id) {
  playlist._drag.fromId = id;
  setTimeout(() => {
    const el = document.querySelector(`.pl-item[data-id="${id}"]`);
    if (el) el.classList.add('dragging');
  }, 0);
}

function plDropOnItem(e, toId) {
  e.preventDefault();
  document.querySelectorAll('.pl-item').forEach(el => {
    el.classList.remove('drag-over', 'dragging');
  });

  const fromId = playlist._drag.fromId;
  if (!fromId || fromId === toId) return;

  const items   = playlist.items;
  const fromIdx = items.findIndex(x => x.id === fromId);
  const toIdx   = items.findIndex(x => x.id === toId);
  if (fromIdx === -1 || toIdx === -1) return;

  const [moved] = items.splice(fromIdx, 1);
  items.splice(toIdx, 0, moved);

  renderPlaylist();
  updatePlaylistPreview();
  renderTimeline();
}

function plDrop(e) {
  e.preventDefault();
  document.querySelectorAll('.pl-item').forEach(el => el.classList.remove('drag-over', 'dragging'));
}

// Item controls
function togglePlItem(id) {
  const item = playlist.items.find(x => x.id === id);
  if (!item) return;
  item.enabled = !item.enabled;
  renderPlaylist();
  updatePlaylistPreview();
  renderTimeline();
}

function removePlItem(id) {
  playlist.items = playlist.items.filter(x => x.id !== id);
  renderPlaylist();
  updatePlaylistPreview();
  renderTimeline();
}

function setPlInterval(id, val) {
  const item = playlist.items.find(x => x.id === id);
  if (item) { item.intervalSec = Math.max(0, parseInt(val) || 0); updatePlTotalTime(); renderTimeline(); }
}

function setPlPose(id, val) {
  const item = playlist.items.find(x => x.id === id);
  if (item) item.intervalPose = val;
}

function setPlIntervalTempBased(id, checked) {
  const item = playlist.items.find(x => x.id === id);
  if (item) { item.intervalTempBased = checked; renderPlaylist(); }
}

function plInsertNext(id) {
  const idx = playlist.items.findIndex(x => x.id === id);
  const cur  = playlist.currentIndex;
  if (idx === -1) return;
  const [item] = playlist.items.splice(idx, 1);
  const insertAt = cur >= 0 ? cur + 1 : 0;
  playlist.items.splice(insertAt, 0, item);
  renderPlaylist();
  updatePlaylistPreview();
}

function clearPlaylist() {
  playlist.items = [];
  playlist.currentIndex = -1;
  renderPlaylist();
  updatePlaylistPreview();
  renderTimeline();
}

function setPlLoop() {
  playlist.loop = document.getElementById('plLoopToggle').checked;
  renderPlaylist();
  renderTimeline();
}

// ── Show Mode Playback ───────────────────────────────────────
function startPlaylist() {
  const enabled = playlist.items.filter(x => x.enabled);
  if (!enabled.length) return;

  playlist.isRunning        = true;
  playlist._enabledItems    = enabled;
  playlist._showState       = 'playing';
  playlist._showCurrentTime = 0;
  playlist._showLoopCount   = 1;

  // 설정 화면 숨기고 공연 진행 화면으로 전환 (탭 이동 없음)
  document.getElementById('plSetupView').classList.add('hidden');
  document.getElementById('plSetupActions').classList.add('hidden');
  document.getElementById('plRunningView').classList.remove('hidden');

  showRunSet(0);
}

function showRunSet(idx) {
  const enabled = playlist._enabledItems;
  const item    = enabled[idx];

  // 루프로 처음으로 돌아오면 반복 횟수 증가
  if (idx === 0 && playlist._showCurrentIdx != null && playlist._showCurrentIdx > 0) {
    playlist._showLoopCount = (playlist._showLoopCount ?? 1) + 1;
  }

  playlist._showState       = 'playing';
  playlist._showCurrentIdx  = idx;
  playlist._showCurrentTime = 0;
  clearInterval(playlist._showTimer);
  clearInterval(playlist._showIntervalTimer);

  // UI 상태 전환
  document.getElementById('showPlayingState').classList.remove('hidden');
  document.getElementById('showIntervalState').classList.add('hidden');
  document.getElementById('showDoneState').classList.add('hidden');

  document.getElementById('showSetCounter').textContent = `SET ${idx + 1} / ${enabled.length}`;
  document.getElementById('showSetName').textContent    = item.name;
  document.getElementById('showTimeCurrent').textContent = '0:00';
  document.getElementById('showTimeTotal').textContent   = fmtTime(item.duration);
  document.getElementById('showProgressFill').style.width = '0%';
  document.getElementById('showStateLabel').textContent  = '운영 중';
  document.getElementById('showPauseBtn').textContent    = '⏸ 일시정지';
  document.getElementById('showPauseBtn').disabled       = false;
  setShowLiveDot('playing');

  updateShowOverall(idx);
  updateShowSide(idx);
  updateShowRemainTime(idx);

  const tick = 300;
  playlist._showTimer = setInterval(() => {
    if (playlist._showState !== 'playing') return;
    playlist._showCurrentTime += tick / 1000;

    const pct = Math.min(100, (playlist._showCurrentTime / item.duration) * 100);
    document.getElementById('showProgressFill').style.width = `${pct}%`;
    document.getElementById('showTimeCurrent').textContent  = fmtTime(playlist._showCurrentTime);

    const isLast = idx === enabled.length - 1;
    if (playlist._showCurrentTime >= item.duration) {
      clearInterval(playlist._showTimer);
      if (isLast && !playlist.loop) showDone();
      else showStartInterval(idx);
    }
  }, tick);
}

function showStartInterval(completedIdx) {
  const enabled = playlist._enabledItems;
  const item    = enabled[completedIdx];
  const isLast  = completedIdx === enabled.length - 1;
  const nextIdx = isLast ? 0 : completedIdx + 1;

  playlist._showState = 'interval';
  clearInterval(playlist._showIntervalTimer);

  document.getElementById('showPlayingState').classList.add('hidden');
  document.getElementById('showIntervalState').classList.remove('hidden');

  const poseLabels = { home: '홈 포즈 유지 중', wave: '웨이브 대기 중', rest: '휴식 포즈 유지 중', custom: '커스텀 포즈 유지 중' };
  const label = isLast ? '루프 전 휴식' : '인터벌';
  document.getElementById('showIntervalLabel').textContent  = label;
  document.getElementById('showIntervalIcon').textContent   = isLast ? '↩' : '⏸';
  document.getElementById('showIntervalPose').textContent   = poseLabels[item.intervalPose] ?? '';
  document.getElementById('showStateLabel').textContent     = `${label} 대기 중`;
  document.getElementById('showSetCounter').textContent     = isLast
    ? `루프 후 재시작 준비 중`
    : `SET ${completedIdx + 1} 완료 → SET ${nextIdx + 1} 준비`;
  setShowLiveDot('interval');

  let remain = item.intervalSec;
  document.getElementById('showIntervalCountdown').textContent = fmtSec(remain);

  playlist._showIntervalTimer = setInterval(() => {
    if (playlist._showState !== 'interval') { clearInterval(playlist._showIntervalTimer); return; }
    remain = Math.max(0, remain - 1);
    document.getElementById('showIntervalCountdown').textContent = fmtSec(remain);
    if (remain <= 0) {
      clearInterval(playlist._showIntervalTimer);
      showRunSet(nextIdx);
    }
  }, 1000);
}

function showDone() {
  playlist._showState  = 'done';
  playlist.isRunning   = false;
  clearInterval(playlist._showTimer);
  clearInterval(playlist._showIntervalTimer);

  document.getElementById('showPlayingState').classList.add('hidden');
  document.getElementById('showIntervalState').classList.add('hidden');
  document.getElementById('showDoneState').classList.remove('hidden');
  document.getElementById('showStateLabel').textContent = '운영 완료';
  document.getElementById('showSetCounter').textContent = '운영이 모두 완료되었습니다';
  document.getElementById('showPauseBtn').disabled = true;
  document.getElementById('showRemainTime').textContent = '0초';
  setShowLiveDot('done');
}

function showPause() {
  if (playlist._showState === 'playing') {
    playlist._showState = 'paused';
    document.getElementById('showPauseBtn').textContent   = '▶ 재개';
    document.getElementById('showStateLabel').textContent = '일시정지';
    setShowLiveDot('paused');
  } else if (playlist._showState === 'paused') {
    playlist._showState = 'playing';
    document.getElementById('showPauseBtn').textContent   = '⏸ 일시정지';
    document.getElementById('showStateLabel').textContent = '운영 진행 중';
    setShowLiveDot('playing');
  }
}

function showSkip() {
  const enabled = playlist._enabledItems;
  const nextIdx = (playlist._showCurrentIdx ?? 0) + 1;
  clearInterval(playlist._showTimer);
  clearInterval(playlist._showIntervalTimer);
  if (nextIdx >= enabled.length) {
    if (playlist.loop) showRunSet(0);
    else showDone();
  } else {
    showRunSet(nextIdx);
  }
}

function showStop() {
  clearInterval(playlist._showTimer);
  clearInterval(playlist._showIntervalTimer);
  playlist.isRunning  = false;
  playlist._showState = 'idle';

  document.getElementById('plRunningView').classList.add('hidden');
  document.getElementById('plSetupView').classList.remove('hidden');
  document.getElementById('plSetupActions').classList.remove('hidden');
  updatePlaylistPreview();
}

function setShowLiveDot(state) {
  const dot = document.getElementById('showLiveDot');
  dot.className = `show-live-dot ${state === 'playing' ? '' : state}`;
}

function updateShowOverall(currentIdx) {
  const enabled = playlist._enabledItems;

  document.getElementById('showOverallDots').innerHTML = enabled.map((_, i) => {
    const cls = i < currentIdx ? 'done' : i === currentIdx ? 'current' : '';
    return `<span class="show-dot ${cls}"></span>`;
  }).join('');

  document.getElementById('showOverallLabel').textContent =
    `${currentIdx + 1} / ${enabled.length}개 파일`;

  // 루프 뱃지
  const badge = document.getElementById('showLoopBadge');
  if (playlist.loop) {
    badge.classList.remove('hidden');
    badge.textContent = `🔁 ${playlist._showLoopCount ?? 1}번째 반복`;
  } else {
    badge.classList.add('hidden');
  }
}

function updateShowSide(currentIdx) {
  const enabled = playlist._enabledItems;
  const cur     = enabled[currentIdx];
  const next    = enabled[currentIdx + 1] ?? null;
  const after   = enabled[currentIdx + 2] ?? null;

  const t    = state.maxTemp;
  const tStr = t != null ? `${t.toFixed(1)}°C` : '—°C';
  const tCls = t == null ? '' : t > loadMgmt.skipTempC ? 'temp-hot' : t > loadMgmt.warnTempC ? 'temp-warn' : 'temp-ok';
  const tSts = t == null ? '—' : t > loadMgmt.skipTempC ? '⚠ 과열' : t > loadMgmt.warnTempC ? '↑ 주의' : '정상';

  document.getElementById('showTempVal').textContent   = tStr;
  document.getElementById('showTempVal').className     = `show-temp-val ${tCls}`;
  document.getElementById('showTempStatus').textContent = tSts;

  document.getElementById('showNextName').textContent     = next ? next.name : '(마지막 세트)';
  document.getElementById('showNextMeta').textContent     = next ? `⏱ ${fmtTime(next.duration)}` : '';
  document.getElementById('showNextInterval').textContent = next ? `인터벌 ${fmtSec(cur.intervalSec)} 후 시작` : '';
  document.getElementById('showAfterName').textContent    = after ? after.name : '—';
  document.getElementById('showAfterMeta').textContent    = after ? `⏱ ${fmtTime(after.duration)}` : '';

  const m = Math.floor(state.todayRuntime);
  document.getElementById('showTodayRuntime').textContent = `${Math.floor(m/60)}h ${m%60}m`;
}

function updateShowRemainTime(currentIdx) {
  const enabled = playlist._enabledItems;
  const labelEl = document.getElementById('showRemainLabel');
  const timeEl  = document.getElementById('showRemainTime');

  if (playlist.loop) {
    // 루프 모드: 이번 사이클에서 현재 파일부터 끝까지 남은 시간
    let remain = 0;
    for (let i = currentIdx; i < enabled.length; i++) {
      remain += enabled[i].duration;
      const isLast = i === enabled.length - 1;
      if (!isLast) remain += enabled[i].intervalSec;
    }
    labelEl.textContent = '이번 사이클 남은';
    timeEl.textContent  = fmtSec(Math.round(remain));
  } else {
    // 일반 모드: 전체 남은 시간
    let remain = 0;
    for (let i = currentIdx; i < enabled.length; i++) {
      remain += enabled[i].duration;
      const isLast = i === enabled.length - 1;
      if (!isLast) remain += enabled[i].intervalSec;
    }
    labelEl.textContent = '남은 예상 시간';
    timeEl.textContent  = fmtSec(Math.round(remain));
  }
}

function plStop() {
  clearInterval(playlist._showTimer);
  clearInterval(playlist._showIntervalTimer);
  playlist.isRunning  = false;
  playlist._showState = 'idle';
  updatePlaylistPreview();
}

// Open add-set modal
function openAddModal() {
  const alreadyIds = new Set(playlist.items.map(x => x.fileId));
  document.getElementById('addModalList').innerHTML = MOCK_FILES.map(f => `
    <div class="add-modal-item ${alreadyIds.has(f.id) ? 'already-added' : ''}"
         onclick="App.addModalSelect('${f.id}')">
      <span style="font-size:28px">🎭</span>
      <div class="add-modal-item-body">
        <div class="add-modal-item-name">${f.name} <span style="font-size:11px;color:var(--text-faint)">${f.version}</span></div>
        <div class="add-modal-item-meta">⏱ ${fmtTime(f.duration)} · 📐 ${f.poses} poses · ${f.music || '음악 없음'}${alreadyIds.has(f.id) ? ' · <span style="color:var(--success)">이미 추가됨</span>' : ''}</div>
      </div>
      <button class="btn btn-outline btn-sm">추가</button>
    </div>`).join('');
  showModal('addModal');
}

function addModalSelect(fileId) {
  const f = MOCK_FILES.find(x => x.id === fileId);
  if (!f) return;
  plAddFile(f);
  closeModal('addModal');
  openAddModal(); // refresh
}

// ── 3-step Preview ───────────────────────────────────────────
function updatePlaylistPreview() {
  const active = playlist.items.filter(x => x.enabled);
  const cur    = playlist.isRunning
    ? active.findIndex(x => x.id === playlist.items[playlist.currentIndex]?.id)
    : -1;

  const getItem = (offset) => {
    const idx = cur + offset;
    if (idx < 0 || idx >= active.length) return null;
    return active[idx];
  };

  const renderCard = (idSuffix, item) => {
    const nameEl = document.getElementById(`ppc${idSuffix}`);
    const timeEl = document.getElementById(`ppc${idSuffix}Time`);
    if (!nameEl) return;
    nameEl.textContent = item ? item.name : '—';
    timeEl.textContent = item ? fmtTime(item.duration) : '—';
  };

  renderCard('Now',   cur >= 0 ? active[cur] : (active[0] ?? null));
  renderCard('Next',  active[cur >= 0 ? cur + 1 : 1] ?? null);
  renderCard('After', active[cur >= 0 ? cur + 2 : 2] ?? null);
}

// ── Total Time ───────────────────────────────────────────────
function calcTotalSec() {
  const enabled = playlist.items.filter(x => x.enabled);
  let total = 0;
  enabled.forEach((item, idx) => {
    total += item.duration / state.speed;
    const isLast = idx === enabled.length - 1;
    if (!isLast || playlist.loop) {
      total += item.intervalSec;
      if (state.maxTemp != null && state.maxTemp > loadMgmt.warnTempC - 5) {
        if (idx % 2 === 1) total += loadMgmt.autoCooldownSec;
      }
    }
  });
  return Math.round(total);
}

function updatePlTotalTime() {
  const sec = calcTotalSec();
  document.getElementById('plTotalTime').textContent = sec ? fmtSec(sec) : '—';
}

// ── Timeline ─────────────────────────────────────────────────
function renderTimeline() {
  const wrap    = document.getElementById('plTimeline');
  const enabled = playlist.items.filter(x => x.enabled);

  if (!enabled.length) {
    wrap.innerHTML = '<div class="pl-timeline-empty">파일을 추가하면 타임라인이 표시됩니다</div>';
    return;
  }

  // Build segments array
  const segs = [];
  const nearWarn = state.maxTemp != null && state.maxTemp > loadMgmt.warnTempC - 5;

  enabled.forEach((item, idx) => {
    segs.push({ type: 'perf', label: item.name, sec: item.duration / state.speed });
    const isLast = idx === enabled.length - 1;
    if (!isLast || playlist.loop) {
      const label = isLast ? '루프 후 휴식' : '인터벌';
      segs.push({ type: isLast ? 'loop-rest' : 'interval', label, sec: item.intervalSec });
      if (nearWarn && idx % 2 === 1) {
        segs.push({ type: 'cool', label: '쿨다운', sec: loadMgmt.autoCooldownSec });
      }
    }
  });

  const totalSec = segs.reduce((a, s) => a + s.sec, 0) || 1;

  wrap.innerHTML = `
    <div class="pl-timeline-inner">
      ${segs.map(s => {
        const pct   = (s.sec / totalSec * 100).toFixed(1);
        const cls   = `tl-seg tl-seg-${s.type}`;
        const label = s.sec >= 10 ? s.label : '';
        const time  = s.sec >= 5  ? fmtSec(Math.round(s.sec)) : '';
        return `<div class="${cls}" style="flex:${pct}" title="${s.label} · ${fmtSec(Math.round(s.sec))}">
          <span class="tl-seg-label">${label}</span>
          <span class="tl-seg-time">${time}</span>
        </div>`;
      }).join('')}
    </div>`;

  updatePlTotalTime();
}

// ── Load Management UI ───────────────────────────────────────
function setLmWarnTemp(val) {
  loadMgmt.warnTempC = parseInt(val);
  renderTimeline(); updateLoadMgmtStatus();
}
function setLmCooldown(val) {
  loadMgmt.autoCooldownSec = parseInt(val);
  renderTimeline(); updateLoadMgmtStatus();
}
function setLmSkipTemp(val) {
  loadMgmt.skipTempC = parseInt(val);
  updateLoadMgmtStatus();
}
function setLmMaxDaily(val) {
  loadMgmt.maxDailyMinutes = parseInt(val);
  updateLoadMgmtStatus();
}

function updateLoadMgmtStatus() {
  const t    = state.maxTemp;
  const tStr = t != null ? `${t.toFixed(1)}°C` : '—°C';
  const tCls = t == null ? '' : t > loadMgmt.skipTempC ? 'temp-hot' : t > loadMgmt.warnTempC ? 'temp-warn' : 'temp-ok';

  const tempEl = document.getElementById('lmCurrentTemp');
  if (tempEl) { tempEl.textContent = tStr; tempEl.className = `lm-status-val ${tCls}`; }

  const m = Math.round(state.todayRuntime);
  const runtimeEl = document.getElementById('lmTodayRuntime');
  if (runtimeEl) runtimeEl.textContent = `${m}분 / ${loadMgmt.maxDailyMinutes}분`;

  const coolEl = document.getElementById('lmAutoCoolStatus');
  if (coolEl) {
    if (t == null)                        coolEl.textContent = '대기 중';
    else if (t > loadMgmt.skipTempC)      coolEl.textContent = `스킵 구간 (${t.toFixed(1)}°C)`;
    else if (t > loadMgmt.warnTempC)      coolEl.textContent = `삽입 예정 ${loadMgmt.autoCooldownSec}초`;
    else                                  coolEl.textContent = '정상';
  }

  const nextEl = document.getElementById('lmNextSetStatus');
  if (nextEl) {
    if (t != null && t > loadMgmt.skipTempC)     nextEl.textContent = '⚠ 스킵';
    else if (t != null && t > loadMgmt.warnTempC) nextEl.textContent = '⏸ 쿨다운 후 시작';
    else                                           nextEl.textContent = '정상 실행';
  }
}

// ════════════════════════════════════════════════════════════
// MONITOR SCREEN
// ════════════════════════════════════════════════════════════

const JOINTS = [
  { id: 'L1', arm: 'L' }, { id: 'L2', arm: 'L' }, { id: 'L3', arm: 'L' },
  { id: 'L4', arm: 'L' }, { id: 'L5', arm: 'L' }, { id: 'L6', arm: 'L' }, { id: 'L7', arm: 'L' },
  { id: 'R1', arm: 'R' }, { id: 'R2', arm: 'R' }, { id: 'R3', arm: 'R' },
  { id: 'R4', arm: 'R' }, { id: 'R5', arm: 'R' }, { id: 'R6', arm: 'R' }, { id: 'R7', arm: 'R' },
];

// joint telemetry state (mock — replaced by WebSocket data in production)
const monState = {
  joints: JOINTS.map(j => ({
    id: j.id, arm: j.arm,
    pos: 0, vel: 0, effort: 0, temp: 36.0, ok: true
  })),
  hz: 0,
};

function pushFakeTelemetryJoints() {
  monState.joints.forEach(j => {
    j.pos    = parseFloat((j.pos + (Math.random() - 0.5) * 0.02).toFixed(4));
    j.vel    = parseFloat(((Math.random() - 0.5) * 0.4).toFixed(4));
    j.effort = parseFloat(((Math.random() - 0.5) * 6).toFixed(3));
    j.temp   = parseFloat(Math.max(32, Math.min(72,
                 j.temp + (Math.random() - 0.48) * 0.3)).toFixed(1));
    j.ok     = j.temp < loadMgmt.skipTempC;
  });
  monState.hz = 50 + Math.round(Math.random() * 10);
  if (state.currentScreen === 'monitor') renderMonitor();
  updateMonSidebar();
}

function renderMonitor() {
  const lJoints = monState.joints.filter(j => j.arm === 'L');
  const rJoints = monState.joints.filter(j => j.arm === 'R');
  renderArmTable('monTbodyL', lJoints);
  renderArmTable('monTbodyR', rJoints);
  renderArmPills('monLPills', lJoints);
  renderArmPills('monRPills', rJoints);
  document.getElementById('monHz').textContent = `${monState.hz} Hz`;
  const monDot = document.getElementById('monDot');
  const monLabel = document.getElementById('monConnLabel');
  if (state.connected) {
    monDot.className  = 'conn-dot connected';
    monLabel.textContent = '연결됨';
  } else {
    monDot.className  = 'conn-dot';
    monLabel.textContent = '미연결';
  }
}

function renderArmTable(tbodyId, joints) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = joints.map(j => {
    const tempCls = j.temp > loadMgmt.skipTempC ? 'hot' : j.temp > loadMgmt.warnTempC ? 'warn' : 'ok';
    const stsCls  = j.ok ? 'ok' : 'error';
    const stsLbl  = j.ok ? '정상' : '오류';
    return `<tr>
      <td class="td-joint">${j.id}</td>
      <td>${j.pos.toFixed(4)}</td>
      <td>${j.vel.toFixed(4)}</td>
      <td>${j.effort.toFixed(3)}</td>
      <td class="td-temp ${tempCls}">${j.temp.toFixed(1)}°C</td>
      <td class="td-status ${stsCls}">${stsLbl}</td>
    </tr>`;
  }).join('');
}

function renderArmPills(pillsId, joints) {
  const el = document.getElementById(pillsId);
  if (!el) return;
  const maxT = Math.max(...joints.map(j => j.temp));
  const errCount = joints.filter(j => !j.ok).length;
  const tempCls = maxT > loadMgmt.skipTempC ? 'hot' : maxT > loadMgmt.warnTempC ? 'warn' : 'ok';
  el.innerHTML = `
    <span class="mon-arm-pill ${tempCls}">MAX ${maxT.toFixed(1)}°C</span>
    <span class="mon-arm-pill ${errCount > 0 ? 'hot' : 'ok'}">${errCount > 0 ? `오류 ${errCount}` : '전체 정상'}</span>
  `;
}

function updateMonSidebar() {
  const allTemps = monState.joints.map(j => j.temp);
  const maxT = Math.max(...allTemps);
  const tempCls = maxT > loadMgmt.skipTempC ? 'temp-hot' : maxT > loadMgmt.warnTempC ? 'temp-warn' : 'temp-ok';
  const maxEl = document.getElementById('monMaxTemp');
  if (maxEl) { maxEl.textContent = `${maxT.toFixed(1)}°C`; maxEl.className = `sysmon-stat-val ${tempCls}`; }
  const runEl = document.getElementById('monTodayRun');
  const h = Math.floor(state.todayRuntime / 60);
  const m = Math.floor(state.todayRuntime % 60);
  if (runEl) runEl.textContent = `${h}h ${m}m`;
  const hzEl = document.getElementById('monHzCard');
  if (hzEl) hzEl.textContent = state.connected ? `${monState.hz} Hz` : '—';
  const statusEl = document.getElementById('monOverallStatus');
  if (statusEl) {
    const errCount = monState.joints.filter(j => !j.ok).length;
    statusEl.textContent = errCount > 0 ? `오류 ${errCount}관절` : '전체 정상';
    statusEl.className = `sysmon-stat-val ${errCount > 0 ? 'temp-hot' : 'temp-ok'}`;
  }
  // also keep topbar maxTemp in sync
  state.maxTemp = maxT;
  updateTempUI();
}


// ════════════════════════════════════════════════════════════
// CALIBRATION SCREEN
// ════════════════════════════════════════════════════════════

const calState = {
  launchRunning: false,
  launchConfig: 'bimanual',
  canConnected: false,
  motorEnabled: false,
};

const LAUNCH_LABELS = {
  bimanual:   '양팔 하드웨어',
  moveit:     'MoveIt (교시 모드)',
  sim:        '양팔 시뮬레이션',
  preview:    '단일팔 프리뷰',
  rosbridge:  '웹 뷰어 (rosbridge)',
};

function initMonitorScreen() {
  // 환경 상태 mock (실제 구현 시 GET /api/ros/env 로 교체)
  const envOk = state.connected;
  setEnvCard('envRos2',  envOk, envOk ? 'Humble' : '미설정',       envOk ? '✓' : '✗');
  setEnvCard('envWs',    envOk, envOk ? 'openarmx_ws' : '없음',    envOk ? '✓' : '?');
  setEnvCard('envBuild', envOk, envOk ? '빌드됨' : 'colcon 필요',  envOk ? '✓' : '!');
}

function setEnvCard(id, ok, val, icon) {
  const card = document.getElementById(id);
  const valEl = document.getElementById(id + 'Val');
  const iconEl = document.getElementById(id + 'Icon');
  if (!card || !valEl || !iconEl) return;
  card.className = `sysmon-env-card ${ok ? 'ok' : 'warn'}`;
  valEl.textContent  = val;
  iconEl.textContent = icon;
}

function calSetResult(elId, msg, cls) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.className = `sysmon-result ${cls}`;
}

function calLaunch() {
  const sel = document.getElementById('calLaunchSelect');
  const cfg = sel ? sel.value : 'bimanual';
  const label = LAUNCH_LABELS[cfg] || cfg;
  calState.launchRunning = true;
  calState.launchConfig  = cfg;
  document.getElementById('calLaunchStartBtn').disabled = true;
  document.getElementById('calLaunchStopBtn').disabled  = false;
  const dot   = document.getElementById('calLaunchDot');
  const lbl   = document.getElementById('calLaunchLabel');
  dot.className = 'conn-dot connected';
  lbl.textContent = `실행 중 — ${label}`;
}

function calLaunchStop() {
  calState.launchRunning = false;
  document.getElementById('calLaunchStartBtn').disabled = false;
  document.getElementById('calLaunchStopBtn').disabled  = true;
  const dot = document.getElementById('calLaunchDot');
  const lbl = document.getElementById('calLaunchLabel');
  dot.className = 'conn-dot';
  lbl.textContent = '미실행';
}

function canConnect() {
  calSetResult('calCanResult', 'CAN 활성화 중... (en_all_can.py)', 'running');
  setTimeout(() => {
    calState.canConnected = true;
    calSetResult('calCanResult', '✓ CAN 인터페이스 활성화 완료', 'ok');
  }, 1000);
}

function canDisconnect() {
  calSetResult('calCanResult', 'CAN 비활성화 중...', 'running');
  setTimeout(() => {
    calState.canConnected = false;
    calSetResult('calCanResult', '✓ CAN 인터페이스 비활성화 완료', 'ok');
  }, 700);
}

function motorEnableCal() {
  calSetResult('calMotorResult', '전체 모터 활성화 중... (en_all_motors.py)', 'running');
  setTimeout(() => {
    calState.motorEnabled = true;
    calSetResult('calMotorResult', '✓ 전체 14관절 모터 활성화 완료', 'ok');
  }, 1200);
}

function motorDisableCal() {
  calSetResult('calMotorResult', '전체 모터 비활성화 중... (dis_all_motors.py)', 'running');
  setTimeout(() => {
    calState.motorEnabled = false;
    calSetResult('calMotorResult', '✓ 전체 모터 비활성화 완료', 'ok');
  }, 900);
}

function motorStatusCheckCal() {
  calSetResult('calDiagResult', '모터 상태 확인 중...', 'running');
  setTimeout(() => {
    pushFakeTelemetryJoints();
    const errs = monState.joints.filter(j => !j.ok).length;
    calSetResult('calDiagResult',
      errs === 0
        ? '✓ 전체 14관절 정상\n각도/속도/토크/온도 정상 범위 확인'
        : `⚠ 오류 관절 ${errs}개 감지`,
      errs === 0 ? 'ok' : 'err');
    // reveal joint table
    document.getElementById('monTableEmpty')?.classList.add('hidden');
    document.getElementById('monTables')?.classList.remove('hidden');
    renderMonitor();
    updateMonSidebar();
  }, 1500);
}

function calHome() {
  calSetResult('calHomeResult', '홈 포지션 이동 중... → POST /api/calibration/home', 'running');
  setTimeout(() => {
    calSetResult('calHomeResult', '✓ 홈 포지션 복귀 완료 (14/14 관절)', 'ok');
  }, 2000);
}


function calMotorTest() {
  const btn = document.getElementById('calMotorTestBtn');
  if (!btn) return;
  btn.disabled = true;
  calSetResult('calMotorTestResult', '순차 모터 테스트 진행 중... (test_motor_one_by_one.py)\n각 관절 ±0.2 rad 왕복 테스트', 'running');
  setTimeout(() => {
    btn.disabled = false;
    calSetResult('calMotorTestResult', '✓ 전체 14관절 순차 테스트 완료\n이상 관절 없음', 'ok');
  }, 4000);
}


// ════════════════════════════════════════════════════════════
// SAFETY SCREEN
// ════════════════════════════════════════════════════════════

const SAFETY_ITEMS = [
  { id: 'si1', text: '시스템 연결 확인',         sub: 'ROS2 런치 실행 · CAN 연결 완료 여부',            auto: false, link: 'monitor'  },
  { id: 'si2', text: '관절 온도 정상 범위',      sub: '최고 온도 55°C 미만 확인 — 초기 설정 탭 참고',   auto: true,  link: 'monitor'  },
  { id: 'si3', text: '홈 포지션 복귀 완료',      sub: '초기 설정 03단계 홈 복귀 실행 여부',             auto: false, link: 'monitor'  },
  { id: 'si4', text: '운영 구역 안전 확인',      sub: '동작 반경 내 사람·장애물 없음, 안전 경계선 설치', auto: false },
  { id: 'si7', text: '플레이리스트 등록 확인',   sub: '플레이리스트 탭에서 파일 1개 이상 등록 여부',     auto: true,  link: 'playlist' },
];

const safetyState = {
  checked: {},
};

function initSafetyScreen() {
  renderSafetyChecklist();
  safetyAutoCheck();
  updateSafetyConn();
}

function renderSafetyChecklist() {
  const list = document.getElementById('safetyChecklist');
  list.innerHTML = SAFETY_ITEMS.map((item, idx) => {
    const checked = !!safetyState.checked[item.id];
    const linkBtn = item.link
      ? `<button class="safety-goto-btn" onclick="event.stopPropagation();App.nav('${item.link}')">→ 이동</button>`
      : '';
    return `
      <div class="safety-item ${checked ? 'checked' : ''}" id="sitem-${item.id}"
           onclick="App.safetyToggleItem('${item.id}')">
        <span class="safety-item-num">${idx + 1}</span>
        <div class="safety-item-check">${checked ? '✓' : ''}</div>
        <div class="safety-item-body">
          <div class="safety-item-text">${item.text}</div>
          <div class="safety-item-sub">${item.sub}</div>
        </div>
        ${item.auto ? '<span class="safety-auto-badge">자동감지</span>' : ''}
        ${linkBtn}
      </div>`;
  }).join('');
  updateSafetyProgress();
}

function safetyAutoCheck() {
  // 관절 온도 자동 감지
  const maxT = state.maxTemp;
  if (maxT != null && maxT < loadMgmt.warnTempC) {
    safetyState.checked['si2'] = true;
  }
  // 플레이리스트 자동 감지
  if (playlist.items.filter(x => x.enabled).length > 0) {
    safetyState.checked['si7'] = true;
  }
  renderSafetyChecklist();
}

function safetyToggleItem(id) {
  safetyState.checked[id] = !safetyState.checked[id];
  renderSafetyChecklist();
}

function safetyResetChecklist() {
  safetyState.checked = {};
  safetyAutoCheck();
}

function updateSafetyProgress() {
  const total   = SAFETY_ITEMS.length;
  const done    = SAFETY_ITEMS.filter(x => safetyState.checked[x.id]).length;
  const pct     = Math.round(done / total * 100);

  document.getElementById('safetyProgressBar').style.width = `${pct}%`;
  document.getElementById('safetyProgressLabel').textContent = `${done} / ${total} 항목 확인`;

  const badge = document.getElementById('safetyOverallBadge');
  if (done === 0) {
    badge.textContent = '확인 대기';
    badge.className   = 'safety-overall-badge';
  } else if (done < total) {
    badge.textContent = `${done}/${total} 확인 중`;
    badge.className   = 'safety-overall-badge partial';
  } else {
    badge.textContent = '✓ 모든 항목 확인 완료';
    badge.className   = 'safety-overall-badge complete';
  }
}

function updateSafetyConn() {
  const dot   = document.getElementById('safetyConnDot');
  const label = document.getElementById('safetyConnLabel');
  if (!dot) return;
  dot.className     = `conn-dot ${state.connected ? 'connected' : 'error'}`;
  label.textContent = state.connected ? '로봇 PC 연결됨' : '연결 끊김';
}

// ── Init ─────────────────────────────────────────────────────
function init() {
  renderFileList();
  updatePlayUI();
  updateProgressUI();
  setSpeed(1.0);
  renderPlaylist();
  initSafetyScreen();   // 초기 화면이 안전이므로 즉시 렌더
  updatePlaylistPreview();
  initWS();
}

// ── Public API ───────────────────────────────────────────────
window.App = {
  nav, filterFiles, sortFiles,
  selectFile, loadAndPlay, loadToPlayer, deleteFile, showDetailPlayer,
  togglePlay, stop, seekTo, seekRel, seek,
  setSpeed, setSpeedSlider,
  showModal, closeModal,
  // playlist setup
  openAddModal, addModalSelect, addToPlaylist,
  togglePlItem, removePlItem, setPlInterval, setPlPose,
  setPlIntervalTempBased, clearPlaylist, setPlLoop, plDrop,
  // show mode
  startPlaylist, showPause, showSkip, showStop,
  // load mgmt
  setLmWarnTemp, setLmCooldown, setLmSkipTemp, setLmMaxDaily,
  // monitor / 초기 설정
  calLaunch, calLaunchStop,
  canConnect, canDisconnect,
  motorEnableCal, motorDisableCal, motorStatusCheckCal,
  calHome, calMotorTest,
  // checklist
  safetyToggleItem, safetyResetChecklist,
};

init();
