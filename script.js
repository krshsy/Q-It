let queue = [];
let courts = [];
let matchHistory = [];
let removalHistory = [];
let sessionActive = false;
let sessionName = "Pickleball Open Play";

const HISTORY_LIMIT = 3;
const SOFT_REST_MS = 5 * 60 * 1000; // 5 minute visual "Resting" warning

window.onload = () => {
    setInterval(updateTimers, 1000);
};

function getRankClass(r) {
    r = r.toUpperCase();
    return r === 'I' ? 'rank-i' : r === 'AB' ? 'rank-ab' : r === 'B' ? 'rank-b' : '';
}

function getRankSpan(rank) {
    return `<span class="rank-tag ${getRankClass(rank)}">${rank}</span>`;
}

function startSession() {
    const count = parseInt(document.getElementById('courtCountInput').value) || 1;
    const nameInput = document.getElementById('sessionNameInput').value;
    if (nameInput) {
        sessionName = nameInput;
        document.getElementById('displaySessionName').innerText = sessionName;
    }
    courts = Array.from({ length: count }, (_, i) => ({ 
        id: i + 1, teamA: [], teamB: [], startTime: null 
    }));
    sessionActive = true;
    document.getElementById('setupControls').style.display = 'none';
    document.getElementById('sessionControls').style.display = 'block';
    updateDisplay();
}

function populatePlayers() {
    const input = document.getElementById('playerInput');
    input.value.split('\n').forEach(line => {
        if (!line.trim()) return;
        const parts = line.trim().split(' ');
        const rank = parts.length > 1 ? parts.pop().toUpperCase() : '??';
        queue.push({ 
            name: parts.join(' '), rank, games: 0, wins: 0, losses: 0, 
            lastFinished: 0, partnerHistory: [], jitter: Math.random() 
        });
    });
    input.value = "";
    updateDisplay();
}

function removePlayer(name) {
    const player = queue.find(p => p.name === name);
    if (!player) return;
    const all = [...queue, ...courts.flatMap(c => [...c.teamA, ...c.teamB])].sort((a,b) => b.wins - a.wins);
    const rankPos = all.findIndex(p => p.name === name) + 1;
    removalHistory.push({
        name: player.name, rank: player.rank,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        stats: `${player.games}G (${player.wins}W-${player.losses}L) | Rank: #${rankPos}`
    });
    queue = queue.filter(p => p.name !== name);
    updateDisplay();
}

function updateDisplay() {
    if (!sessionActive) return;
    const statsBody = document.getElementById('statsBody');
    const leaderboardBody = document.getElementById('leaderboardBody');
    const courtsDiv = document.getElementById('courts');
    const matchLog = document.getElementById('matchLog');
    const removalLog = document.getElementById('removalLog');

    // Priority Sort: 1. Games Played (Fewest), 2. Wait Time (Longest), 3. Jitter
    queue.sort((a, b) => a.games - b.games || a.lastFinished - b.lastFinished || a.jitter - b.jitter);

    statsBody.innerHTML = queue.map(p => `
        <tr>
            <td>${p.name} ${getRankSpan(p.rank)}</td>
            <td>${p.games}</td>
            <td>${p.wins}-${p.losses}</td>
            <td class="status-cell" id="status-${p.name.replace(/\s+/g, '')}" data-start="${p.lastFinished}">Ready</td>
            <td><button class="btn-remove" onclick="removePlayer('${p.name}')">Remove</button></td>
        </tr>
    `).join('');

    const allPlayers = [...queue, ...courts.flatMap(c => [...c.teamA, ...c.teamB])];
    allPlayers.sort((a, b) => b.wins - a.wins || (b.wins/Math.max(1, b.games)) - (a.wins/Math.max(1, a.games)));
    
    leaderboardBody.innerHTML = allPlayers.slice(0, 10).map((p, i) => {
        let medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : (i + 1) + '. ';
        return `<tr><td>${medal}</td><td>${p.name} ${getRankSpan(p.rank)}</td><td>${p.wins}</td><td>${p.games > 0 ? Math.round((p.wins/p.games)*100) : 0}%</td></tr>`;
    }).join('');

    courtsDiv.innerHTML = courts.map(c => `
        <div class="court-card">
            <span class="court-timer" id="timer-court-${c.id}" data-start="${c.startTime}">--:--</span>
            <h3>Court ${c.id}</h3>
            ${c.teamA.length ? `
                <div class="pair">${c.teamA[0].name} ${getRankSpan(c.teamA[0].rank)} &<br>${c.teamA[1].name} ${getRankSpan(c.teamA[1].rank)}</div>
                <div class="vs">VS</div>
                <div class="pair">${c.teamB[0].name} ${getRankSpan(c.teamB[0].rank)} &<br>${c.teamB[1].name} ${getRankSpan(c.teamB[1].rank)}</div>
                <div style="display:flex; justify-content:space-between;">
                    <button class="btn-win" onclick="finishMatch(${c.id}, 'A')">A Wins</button>
                    <button class="btn-win" onclick="finishMatch(${c.id}, 'B')">B Wins</button>
                </div>
            ` : `<button class="btn-call" onclick="fillCourt(${c.id})">Call Players</button>`}
        </div>
    `).join('');

    matchLog.innerHTML = matchHistory.map(m => `<div class="log-entry"><small>${m.time}</small><br><b>${m.winners}</b> def. ${m.losers}</div>`).reverse().join('');
    removalLog.innerHTML = removalHistory.map(r => `<div class="removal-entry"><small>${r.time}</small> - <b>${r.name}</b> ${getRankSpan(r.rank)}<br><span style="color:#64748b;">${r.stats}</span></div>`).reverse().join('');
    document.getElementById('playerCount').innerText = allPlayers.length;
}

function fillCourt(courtId) {
    if (queue.length < 4) return alert("Need 4 players.");
    const court = courts.find(c => c.id === courtId);
    
    // 1. SELECTION: Takes top 4 based on (Games -> Wait Time -> Jitter)
    let batch = queue.splice(0, 4);
    
    const getOverlap = (p1, p2) => p1.partnerHistory.includes(p2.name) ? 1 : 0;
    
    const countRank = (r) => batch.filter(p => p.rank.toUpperCase() === r.toUpperCase()).length;
    const getPlayersByRank = (r) => batch.filter(p => p.rank.toUpperCase() === r.toUpperCase());

    let options = [];

    // --- CONDITION 1: Two Is and Two ABs (Split the Is) ---
    if (countRank('I') === 2 && countRank('AB') === 2) {
        const iPlayers = getPlayersByRank('I');
        const abPlayers = getPlayersByRank('AB');
        options = [
            { a: [iPlayers[0], abPlayers[0]], b: [iPlayers[1], abPlayers[1]], score: getOverlap(iPlayers[0], abPlayers[0]) + getOverlap(iPlayers[1], abPlayers[1]) },
            { a: [iPlayers[0], abPlayers[1]], b: [iPlayers[1], abPlayers[0]], score: getOverlap(iPlayers[0], abPlayers[1]) + getOverlap(iPlayers[1], abPlayers[0]) }
        ];
    } 
    // --- CONDITION 2: Two Is, One AB, One B (I+B vs I+AB) ---
    else if (countRank('I') === 2 && countRank('AB') === 1 && countRank('B') === 1) {
        const iPlayers = getPlayersByRank('I');
        const abPlayer = getPlayersByRank('AB')[0];
        const bPlayer = getPlayersByRank('B')[0];
        // Split Is: Option 1 (I1+B vs I2+AB) or Option 2 (I1+AB vs I2+B)
        options = [
            { a: [iPlayers[0], bPlayer], b: [iPlayers[1], abPlayer], score: getOverlap(iPlayers[0], bPlayer) + getOverlap(iPlayers[1], abPlayer) },
            { a: [iPlayers[0], abPlayer], b: [iPlayers[1], bPlayer], score: getOverlap(iPlayers[0], abPlayer) + getOverlap(iPlayers[1], bPlayer) }
        ];
    }
    // --- CONDITION 3: Two Is and Two Bs (Split the Is) ---
    else if (countRank('I') === 2 && countRank('B') === 2) {
        const iPlayers = getPlayersByRank('I');
        const bPlayers = getPlayersByRank('B');
        options = [
            { a: [iPlayers[0], bPlayers[0]], b: [iPlayers[1], bPlayers[1]], score: getOverlap(iPlayers[0], bPlayers[0]) + getOverlap(iPlayers[1], bPlayers[1]) },
            { a: [iPlayers[0], bPlayers[1]], b: [iPlayers[1], bPlayers[0]], score: getOverlap(iPlayers[0], bPlayers[1]) + getOverlap(iPlayers[1], bPlayers[0]) }
        ];
    }
    // --- CONDITION 4: One I, Two ABs, One B (ABs together vs High/Low) ---
    else if (countRank('AB') === 2 && countRank('I') === 1 && countRank('B') === 1) {
        const abPlayers = getPlayersByRank('AB');
        const iPlayer = getPlayersByRank('I')[0];
        const bPlayer = getPlayersByRank('B')[0];
        options = [{ a: [abPlayers[0], abPlayers[1]], b: [iPlayer, bPlayer], score: getOverlap(abPlayers[0], abPlayers[1]) + getOverlap(iPlayer, bPlayer) }];
    }
    // --- CONDITION 5: Two ABs and Two Bs (Split the ABs) ---
    else if (countRank('AB') === 2 && countRank('B') === 2) {
        const abPlayers = getPlayersByRank('AB');
        const bPlayers = getPlayersByRank('B');
        options = [
            { a: [abPlayers[0], bPlayers[0]], b: [abPlayers[1], bPlayers[1]], score: getOverlap(abPlayers[0], bPlayers[0]) + getOverlap(abPlayers[1], bPlayers[1]) },
            { a: [abPlayers[0], bPlayers[1]], b: [abPlayers[1], bPlayers[0]], score: getOverlap(abPlayers[0], bPlayers[1]) + getOverlap(abPlayers[1], bPlayers[0]) }
        ];
    }
    // --- DEFAULT: Standard Variety-First Pairing ---
    else {
        options = [
            { a: [batch[0], batch[3]], b: [batch[1], batch[2]], score: getOverlap(batch[0], batch[3]) + getOverlap(batch[1], batch[2]) },
            { a: [batch[0], batch[2]], b: [batch[1], batch[3]], score: getOverlap(batch[0], batch[2]) + getOverlap(batch[1], batch[3]) },
            { a: [batch[0], batch[1]], b: [batch[2], batch[3]], score: getOverlap(batch[0], batch[1]) + getOverlap(batch[2], batch[3]) }
        ];
    }

    // 3. VARIETY: Select best historical match
    options.sort((a, b) => a.score - b.score);
    
    court.teamA = options[0].a; 
    court.teamB = options[0].b;
    court.startTime = Date.now();

    [...court.teamA, ...court.teamB].forEach((p, i, arr) => {
        let partner = (i % 2 === 0) ? arr[i+1] : arr[i-1];
        p.partnerHistory.push(partner.name);
        if (p.partnerHistory.length > HISTORY_LIMIT) p.partnerHistory.shift();
    });

    updateDisplay();
}

function finishMatch(courtId, winner) {
    const court = courts.find(c => c.id === courtId);
    const wins = winner === 'A' ? court.teamA : court.teamB;
    const loss = winner === 'A' ? court.teamB : court.teamA;
    [...wins, ...loss].forEach(p => {
        p.games++; p.lastFinished = Date.now(); p.jitter = Math.random();
        if (wins.includes(p)) p.wins++; else p.losses++;
        queue.push(p);
    });
    matchHistory.push({ 
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
        winners: `${wins[0].name} & ${wins[1].name}`, losers: `${loss[0].name} & ${loss[1].name}` 
    });
    court.teamA = []; court.teamB = []; court.startTime = null;
    updateDisplay();
}

function updateTimers() {
    const now = Date.now();
    // Update Status Column
    document.querySelectorAll('.status-cell').forEach(el => {
        const start = parseInt(el.getAttribute('data-start'));
        if (!start || start === 0) { 
            el.innerHTML = `<span class="status-ready">Ready</span>`; 
            return; 
        }
        const diff = Math.floor((now - start) / 1000);
        let timeText = `${Math.floor(diff/60)}m ${diff%60}s`;
        if ((now - start) < SOFT_REST_MS) {
            el.innerHTML = `<span class="status-rest">Resting (${timeText})</span>`;
        } else {
            el.innerHTML = `<span class="status-ready">Ready (${timeText})</span>`;
        }
    });

    // Update Court Match Timers
    courts.forEach(c => {
        const el = document.getElementById(`timer-court-${c.id}`);
        if (!el || !c.startTime) return;
        const diff = Math.floor((now - c.startTime) / 1000);
        el.innerText = `${Math.floor(diff/60).toString().padStart(2,'0')}:${(diff%60).toString().padStart(2,'0')}`;
    });
}

function endSession() {
    if (!confirm("End session and generate report?")) return;
    sessionActive = false;
    
    // Hide active UI
    document.getElementById('activeUI').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'none';
    const report = document.getElementById('finalReport');
    report.style.display = 'block';

    // 1. Gather ALL players: Current Queue + On Courts + Removal History
    // We map removalHistory back to a similar structure as active players
    const removedPlayers = removalHistory.map(r => {
        // Extract stats from the string we saved earlier "XG (XW-XL)"
        const statsMatch = r.stats.match(/(\d+)G \((\d+)W-(\d+)L\)/);
        return {
            name: r.name,
            rank: r.rank,
            games: statsMatch ? parseInt(statsMatch[1]) : 0,
            wins: statsMatch ? parseInt(statsMatch[2]) : 0,
            losses: statsMatch ? parseInt(statsMatch[3]) : 0,
            isEarlyOut: true
        };
    });

    const activePlayers = [...queue, ...courts.flatMap(c => [...c.teamA, ...c.teamB])].map(p => ({
        ...p,
        isEarlyOut: false
    }));

    // Combine and Sort by Wins, then Win %
    const allFinalStandings = [...activePlayers, ...removedPlayers].sort((a, b) => 
        b.wins - a.wins || (b.wins / Math.max(1, b.games)) - (a.wins / Math.max(1, a.games))
    );

    report.innerHTML = `
        <div style="text-align:center; margin-bottom: 20px;">
            <h2 style="margin-bottom:5px;">Final Standings: ${sessionName}</h2>
            <span class="badge">Session Summary Report</span>
        </div>
        <div class="table-wrapper">
            <table class="compact-table">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Player</th>
                        <th>W - L</th>
                        <th>Win Rate</th>
                    </tr>
                </thead>
                <tbody>
                    ${allFinalStandings.map((p, i) => {
                        let trophy = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1;
                        let earlyOutTag = p.isEarlyOut ? `<span class="rank-tag" style="background:#64748b; font-size: 0.6em;">Early Out</span>` : '';
                        
                        return `
                            <tr>
                                <td style="font-weight:bold;">${trophy}</td>
                                <td>
                                    ${p.name} ${getRankSpan(p.rank)}
                                    ${earlyOutTag}
                                </td>
                                <td>${p.wins} - ${p.losses}</td>
                                <td>${p.games > 0 ? Math.round((p.wins / p.games) * 100) : 0}%</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        <button class="btn-start" onclick="window.location.reload()" style="margin-top:24px; max-width: 300px; margin-left: auto; margin-right: auto;">
            Start New Session
        </button>
    `;
}