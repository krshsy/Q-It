let queue = [];
let courts = [];
let removalHistory = [];
let matchHistory = [];
let sessionActive = false;
let sessionName = "Q-It | Pickleball Manager";
let manualOverride = false;

const SOFT_REST_MS = 5 * 60 * 1000;
const urlParams = new URLSearchParams(window.location.search);
const isViewOnly = urlParams.get('view') === 'player';

window.onload = () => {
    if (isViewOnly) document.body.classList.add('view-only');
    loadData();
    setInterval(updateTimers, 1000);
};

function saveData() {
    if (isViewOnly) return;
    const data = { queue, courts, removalHistory, matchHistory, sessionActive, sessionName };
    localStorage.setItem('pb_manager_v1', JSON.stringify(data));
}

function loadData() {
    const saved = localStorage.getItem('pb_manager_v1');
    if (saved) {
        const d = JSON.parse(saved);
        queue = d.queue || [];
        courts = d.courts || [];
        removalHistory = d.removalHistory || [];
        matchHistory = d.matchHistory || [];
        sessionActive = d.sessionActive || false;
        sessionName = d.sessionName || "Q-It | Pickleball Manager";
        
        if (sessionActive) {
            document.getElementById('setupControls').style.display = 'none';
            document.getElementById('sessionControls').style.display = 'block';
            document.getElementById('displaySessionName').innerText = sessionName;
            updateDisplay();
        }
    }
}

function getRankSpan(rank) {
    const r = rank.toUpperCase();
    const cls = r === 'I' ? 'rank-i' : r === 'AB' ? 'rank-ab' : r === 'B' ? 'rank-b' : '';
    return `<span class="rank-tag ${cls}">${rank}</span>`;
}

function getWinRate(p) {
    return p.games ? Math.round((p.wins / p.games) * 100) : 0;
}

function startSession() {
    if (sessionActive && !confirm("This will wipe current data. Continue?")) return;
    
    // HARD RESET
    localStorage.removeItem('pb_manager_v1');
    queue = []; courts = []; removalHistory = []; matchHistory = [];
    
    const countInput = parseInt(document.getElementById('courtCountInput').value) || 4;
    sessionName = document.getElementById('sessionNameInput').value || "Pickleball Open Play";
    courts = Array.from({ length: countInput }, (_, i) => ({ id: i + 1, teamA: [], teamB: [], startTime: null }));
    
    sessionActive = true;
    document.getElementById('setupControls').style.display = 'none';
    document.getElementById('sessionControls').style.display = 'block';
    document.getElementById('displaySessionName').innerText = sessionName;
    saveData();
    updateDisplay();
}

function populatePlayers() {
    const input = document.getElementById('playerInput');
    input.value.split('\n').forEach(line => {
        if (!line.trim()) return;
        const parts = line.trim().split(' ');
        const rank = parts.length > 1 ? parts.pop().toUpperCase() : '??';
        queue.push({ name: parts.join(' '), rank, games: 0, wins: 0, losses: 0, lastFinished: 0, jitter: Math.random() });
    });
    input.value = "";
    saveData();
    updateDisplay();
}

/** --- FAIR PLAY PAIRING ENGINE --- **/
function fillCourt(courtId) {
    if (queue.length < 4) return alert("Need 4 players.");
    
    let batch = queue.slice(0, 4);
    const getRCount = (r) => batch.filter(p => p.rank.toUpperCase() === r).length;

    // CIRCUIT BREAKER: Block 3 'I's vs 1 'B'
    if (getRCount('I') === 3 && getRCount('B') === 1) {
        return alert("Unfair Matchup: 3 'I' players and 1 'B' player. Use 'Bump' to rearrange.");
    }

    // Officially pull from queue
    queue.splice(0, 4);
    const court = courts.find(c => c.id === courtId);
    
    const getR = (r) => batch.filter(p => p.rank.toUpperCase() === r);
    const count = (r) => getR(r).length;
    let opts;

    /** --- SPECIAL FAIRNESS RULES --- **/

    // NEW RULE: 2 Bs + 1 AB + 1 I (Split the Bs)
    if (count('B') === 2 && count('AB') === 1 && count('I') === 1) {
        opts = { 
            a: [getR('I')[0], getR('B')[0]], 
            b: [getR('AB')[0], getR('B')[1]] 
        };
    }
    // Existing Rule: 2 Is + 2 ABs (Split the Is)
    else if (count('I') === 2 && count('AB') === 2) {
        opts = { a: [getR('I')[0], getR('AB')[0]], b: [getR('I')[1], getR('AB')[1]] };
    } 
    // Existing Rule: 2 Is + 1 AB + 1 B (Split the Is, partner I with B)
    else if (count('I') === 2 && count('AB') === 1 && count('B') === 1) {
        opts = { a: [getR('I')[0], getR('B')[0]], b: [getR('I')[1], getR('AB')[0]] };
    }
    // Existing Rule: 2 Is + 2 Bs (Split the Is)
    else if (count('I') === 2 && count('B') === 2) {
        opts = { a: [getR('I')[0], getR('B')[0]], b: [getR('I')[1], getR('B')[1]] };
    }
    // Existing Rule: 2 ABs + 1 I + 1 B (Split the ABs)
    else if (count('AB') === 2 && count('I') === 1 && count('B') === 1) {
        opts = { a: [getR('AB')[0], getR('I')[0]], b: [getR('AB')[1], getR('B')[0]] };
    }
    // Existing Rule: 2 ABs + 2 Bs (Split the ABs)
    else if (count('AB') === 2 && count('B') === 2) {
        opts = { a: [getR('AB')[0], getR('B')[0]], b: [getR('AB')[1], getR('B')[1]] };
    } 
    else {
        // Balanced Default: 1st/4th vs 2nd/3rd
        opts = { a: [batch[0], batch[3]], b: [batch[1], batch[2]] };
    }

    court.teamA = opts.a; court.teamB = opts.b; court.startTime = Date.now();
    saveData();
    updateDisplay();
}

function finishMatch(courtId, winner) {
    const c = courts.find(x => x.id === courtId);
    const wins = winner === 'A' ? c.teamA : c.teamB;
    const loss = winner === 'A' ? c.teamB : c.teamA;

    matchHistory.push({
        court: courtId, time: new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit'}),
        winners: wins.map(p => p.name).join(' & '), losers: loss.map(p => p.name).join(' & ')
    });

    [...wins, ...loss].forEach(p => { 
        p.games++; p.lastFinished = Date.now(); 
        wins.includes(p) ? p.wins++ : p.losses++; 
        queue.push(p); 
    });
    c.teamA = []; c.teamB = []; c.startTime = null;
    saveData();
    updateDisplay();
}

function replacePlayer(courtId, team, idx) {
    if (queue.length === 0) return;
    const court = courts.find(c => c.id === courtId);
    const target = team === 'A' ? court.teamA : court.teamB;
    const leaving = target[idx];
    leaving.lastFinished = Date.now();
    target[idx] = queue.shift();
    queue.push(leaving);
    saveData();
    updateDisplay();
}

function bumpDownPlayer(name) {
    const idx = queue.findIndex(p => p.name === name);
    if (idx > -1 && idx < queue.length - 1) {
        const p = queue.splice(idx, 1)[0];
        queue.splice(idx + 1, 0, p);
        manualOverride = true;
        updateDisplay();
        setTimeout(() => { manualOverride = false; saveData(); }, 500);
    }
}

function removePlayer(name) {
    const p = queue.find(x => x.name === name);
    if (!p) return;
    
    // Tag the player for the final report
    p.isEarlyOut = true; 
    p.timeRemoved = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    
    removalHistory.push(p);
    queue = queue.filter(x => x.name !== name);
    saveData();
    updateDisplay();
}

function updateDisplay() {
    if (!sessionActive) return;
    if (!manualOverride) queue.sort((a,b) => a.games - b.games || a.lastFinished - b.lastFinished || a.jitter - b.jitter);
    
    document.getElementById('statsBody').innerHTML = queue.map(p => `
        <tr>
            <td>${p.name} ${getRankSpan(p.rank)}</td>
            <td>${p.games}</td>
            <td>${p.wins}-${p.losses}</td>
            <td class="status-cell" data-start="${p.lastFinished}">Ready</td>
            <td class="admin-only">
                <button class="btn-skip" onclick="bumpDownPlayer('${p.name}')">Bump Down</button>
                <button class="btn-remove" onclick="removePlayer('${p.name}')">X</button>
            </td>
        </tr>`).join('');

    const active = [...queue, ...courts.flatMap(c => [...c.teamA, ...c.teamB])];
    const sorted = [...active].sort((a,b) => b.wins - a.wins || getWinRate(b) - getWinRate(a));
    document.getElementById('leaderboardBody').innerHTML = sorted.slice(0, 10).map((p, i) => `
        <tr><td>${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1} ${p.name}</td><td>${p.wins}-${p.losses}</td><td>${getWinRate(p)}%</td></tr>
    `).join('');

    document.getElementById('matchLog').innerHTML = matchHistory.slice().reverse().map(m => `
        <div class="match-log-entry">
            <div style="display:flex; justify-content:space-between; font-size:0.75em; color:#3b82f6; margin-bottom:6px;">
                <b>COURT ${m.court}</b> <span>${m.time}</span>
            </div>
            <div class="log-winners">🏆 ${m.winners}</div>
            <div style="font-size:0.65em; color:#94a3b8; margin:4px 0; text-transform:uppercase; font-weight:800;">Defeated</div>
            <div style="color:#64748b; font-size:0.9em;">${m.losers}</div>
        </div>`).join('');

    document.getElementById('removalLog').innerHTML = removalHistory.slice().reverse().map(r => `
        <div class="removal-entry">
            <b>${r.name}</b> <small>(${r.timeRemoved})</small> — <span>${r.wins}W-${r.losses}L</span>
        </div>`).join('');

    document.getElementById('courts').innerHTML = courts.map(c => `
        <div class="court-card">
            <span class="court-timer" data-start="${c.startTime}">--:--</span>
            <h3>Court ${c.id}</h3>
            ${c.teamA.length ? `
                <div class="pair">
                    ${[c.teamA, c.teamB].map((t, idx) => `
                        ${t.map((p, pIdx) => `<div class="player-line">${p.name} ${getRankSpan(p.rank)} <button class="btn-sub admin-only" onclick="replacePlayer(${c.id},'${idx===0?'A':'B'}',${pIdx})">🔄</button></div>`).join('')}
                        ${idx===0 ? '<div class="vs">VS</div>' : ''}`).join('')}
                </div>
                <div class="admin-only">
                    <button class="btn-win" onclick="finishMatch(${c.id},'A')">A Wins</button>
                    <button class="btn-win" onclick="finishMatch(${c.id},'B')">B Wins</button>
                </div>` : `<button class="btn-call admin-only" onclick="fillCourt(${c.id})">Call Players</button>`}
        </div>`).join('');

    document.getElementById('playerCount').innerText = active.length;
}

function updateTimers() {
    const now = Date.now();
    document.querySelectorAll('.court-timer, .status-cell').forEach(el => {
        const start = parseInt(el.dataset.start);
        
        // Handle players who haven't played yet
        if (!start || start === 0) {
            if (el.classList.contains('status-cell')) {
                el.innerHTML = `<span style="color:#059669; font-weight:bold;">Ready</span>`;
            }
            return;
        }

        const s = Math.floor((now - start) / 1000);
        const mins = Math.floor(s / 60);
        const secs = s % 60;
        const timeStr = `(${mins}m ${secs}s)`;

        if (el.classList.contains('court-timer')) {
            el.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
        } else {
            const isReady = (now - start) >= SOFT_REST_MS;
            // Display: Ready (1m 10s) or Resting (1m 10s)
            el.innerHTML = `
                <span style="color:${isReady ? '#059669' : '#ef4444'}; font-weight:bold;">
                    ${isReady ? 'Ready' : 'Resting'} 
                    <span style="font-size: 0.85em; font-weight: normal; margin-left: 4px;">${timeStr}</span>
                </span>`;
        }
    });
}

function endSession() {
    if (!confirm("End session and show standings?")) return;
    sessionActive = false;
    document.getElementById('activeUI').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'none';
    const report = document.getElementById('finalReport');
    report.style.display = 'block';

    // Combine active players and removed players for the full report
    const pool = [...queue, ...courts.flatMap(c => [...c.teamA, ...c.teamB]), ...removalHistory];
    const standings = pool.sort((a,b) => b.wins - a.wins || getWinRate(b) - getWinRate(a));

    report.innerHTML = `
        <h2 style="text-align:center;">🏆 Final Standings</h2>
        <div class="table-wrapper">
            <table>
                <thead><tr><th>Rank</th><th>Player</th><th>W-L</th><th>Rate</th></tr></thead>
                <tbody>${standings.map((p, i) => `
                    <tr>
                        <td>${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td>
                        <td>
                            ${p.name} ${getRankSpan(p.rank)}
                            ${p.isEarlyOut ? '<span class="rank-tag" style="background:#64748b; font-size:0.6em; margin-left:8px;">Early Out</span>' : ''}
                        </td>
                        <td>${p.wins}-${p.losses}</td>
                        <td>${getWinRate(p)}%</td>
                    </tr>
                `).join('')}</tbody>
            </table>
        </div>
        ${isViewOnly ? '' : `<button onclick="handleReset()" class="btn-start" style="margin-top:20px;">New Session</button>`}
    `;
}
