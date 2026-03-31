import { useState, useEffect, useRef } from "react";

// ─── API endpoint — calls our secure Netlify function ─────────────────────
const API_URL = "/.netlify/functions/anthropic";

// ─── 2026 Driver lineup ───────────────────────────────────────────────────
const F1_2026_DRIVERS = [
  "Max Verstappen", "Liam Lawson",
  "Charles Leclerc", "Lewis Hamilton",
  "George Russell", "Andrea Kimi Antonelli",
  "Lando Norris", "Oscar Piastri",
  "Fernando Alonso", "Lance Stroll",
  "Pierre Gasly", "Jack Doohan",
  "Yuki Tsunoda", "Isack Hadjar",
  "Esteban Ocon", "Oliver Bearman",
  "Nico Hülkenberg", "Gabriel Bortoleto",
  "Carlos Sainz", "Alexander Albon",
];

const TEAM_COLORS = {
  "Red Bull": "#3671C6",
  "Ferrari": "#E8002D",
  "Mercedes": "#27F4D2",
  "McLaren": "#FF8000",
  "Aston Martin": "#229971",
  "Alpine": "#FF87BC",
  "Racing Bulls": "#6692FF",
  "Haas": "#B6BABD",
  "Williams": "#64C4FF",
  "Audi": "#52E252",
};

const MEDAL = { 1: "#FFD700", 2: "#C0C0C0", 3: "#CD7F32" };

// ─── Secure AI search via Netlify proxy ───────────────────────────────────
async function aiSearch(prompt) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system:
        "You are an F1 data assistant. Search the web for current data then respond with ONLY valid raw JSON — no markdown fences, no explanation, no preamble.",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(text.replace(/```json|```/gi, "").trim());
}

// ─── Fantasy scoring ──────────────────────────────────────────────────────
function fantasyScore(picks, standings) {
  return picks.reduce((sum, pick) => {
    const last = pick.toLowerCase().split(" ").slice(-1)[0];
    const match = standings.find((d) => d.name?.toLowerCase().includes(last));
    return sum + (match?.points || 0);
  }, 0);
}

function teamColor(name) {
  const key = Object.keys(TEAM_COLORS).find((k) =>
    name?.toLowerCase().includes(k.toLowerCase())
  );
  return key ? TEAM_COLORS[key] : "#888";
}

// ─── Shared style objects ─────────────────────────────────────────────────
const S = {
  input: {
    width: "100%",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 5,
    padding: "10px 14px",
    color: "#eee",
    fontSize: 15,
    fontFamily: "inherit",
    boxSizing: "border-box",
  },
  btn: {
    background: "#e60000",
    border: "none",
    borderRadius: 5,
    color: "#fff",
    padding: "11px 24px",
    fontFamily: "inherit",
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    cursor: "pointer",
  },
  ghost: {
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 5,
    color: "#aaa",
    padding: "8px 14px",
    fontFamily: "inherit",
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    cursor: "pointer",
  },
  card: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
  },
  label: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 2.5,
    textTransform: "uppercase",
    color: "#e60000",
  },
};

// ─── UI atoms ─────────────────────────────────────────────────────────────
function Badge({ rank }) {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: "50%",
      background: MEDAL[rank] || "rgba(255,255,255,0.08)",
      color: rank <= 3 ? "#000" : "#999", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 900, fontSize: 13,
    }}>{rank}</div>
  );
}

function Spinner({ msg }) {
  return (
    <div style={{ textAlign: "center", padding: "80px 0", color: "#555" }}>
      <div style={{ fontSize: 48, display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</div>
      {msg && <div style={{ marginTop: 14, fontSize: 14 }}>{msg}</div>}
    </div>
  );
}

function Empty({ msg, onAction, actionLabel }) {
  return (
    <div style={{ textAlign: "center", padding: "70px 0", color: "#555" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🏁</div>
      <div style={{ fontSize: 14, marginBottom: onAction ? 18 : 0 }}>{msg}</div>
      {onAction && <button style={S.btn} onClick={onAction}>{actionLabel}</button>}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("setup");
  const [participants, setParticipants] = useState([]);
  const [formName, setFormName] = useState("");
  const [formPicks, setFormPicks] = useState(["", "", "", "", "", ""]);
  const [editIdx, setEditIdx] = useState(null);

  const [drivers, setDrivers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [races, setRaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState(null);
  const didFetch = useRef(false);

  useEffect(() => {
    if (tab !== "setup" && !didFetch.current) {
      didFetch.current = true;
      doFetch();
    }
  }, [tab]); // eslint-disable-line

  async function doFetch() {
    setLoading(true);
    setError("");
    try {
      setLoadMsg("Fetching driver standings…");
      const d = await aiSearch(
        `Search the web for the latest 2026 Formula 1 World Drivers Championship standings.
Return ONLY a raw JSON array: [{"pos":1,"name":"Max Verstappen","team":"Red Bull","points":25,"wins":1}]
Include all drivers. If the season has not started return [].`
      );
      setDrivers(Array.isArray(d) ? d : []);

      setLoadMsg("Fetching constructor standings…");
      const t = await aiSearch(
        `Search the web for the latest 2026 Formula 1 Constructors Championship standings.
Return ONLY a raw JSON array: [{"pos":1,"name":"McLaren","points":44}]
Include all 10 teams. If season not started return [].`
      );
      setTeams(Array.isArray(t) ? t : []);

      setLoadMsg("Fetching race results…");
      const r = await aiSearch(
        `Search the web for all completed 2026 Formula 1 Grand Prix race results.
Return ONLY a raw JSON array:
[{"round":1,"name":"Australian Grand Prix","location":"Melbourne","date":"2026-03-15",
  "results":[{"pos":1,"driver":"Max Verstappen","team":"Red Bull","grid":1,"points":25}]}]
Top 10 finishers per race. If no races completed yet return [].`
      );
      setRaces(Array.isArray(r) ? r : []);
      setUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setError("Could not load live data. Check your API key is set in Netlify environment variables. (" + e.message + ")");
    }
    setLoading(false);
    setLoadMsg("");
  }

  function refresh() {
    didFetch.current = true;
    doFetch();
  }

  function saveParticipant() {
    if (!formName.trim()) return;
    const picks = formPicks.filter((p) => p.trim());
    if (editIdx !== null) {
      setParticipants((prev) =>
        prev.map((p, i) => (i === editIdx ? { name: formName.trim(), picks } : p))
      );
      setEditIdx(null);
    } else {
      setParticipants((prev) => [...prev, { name: formName.trim(), picks }]);
    }
    setFormName("");
    setFormPicks(["", "", "", "", "", ""]);
  }

  function startEdit(i) {
    setEditIdx(i);
    setFormName(participants[i].name);
    const p = [...participants[i].picks];
    while (p.length < 6) p.push("");
    setFormPicks(p);
  }

  function cancelEdit() {
    setEditIdx(null);
    setFormName("");
    setFormPicks(["", "", "", "", "", ""]);
  }

  const leagueTable = [...participants]
    .map((p) => ({ ...p, pts: fantasyScore(p.picks, drivers) }))
    .sort((a, b) => b.pts - a.pts)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  const TABS = [
    { id: "setup", label: "⚙ Setup" },
    { id: "league", label: "🏆 League" },
    { id: "races", label: "🏁 Races" },
    { id: "standings", label: "📊 Standings" },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0b0b10",
      color: "#e8e8f0",
      fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
      backgroundImage: `
        radial-gradient(ellipse at 15% 60%, rgba(230,0,0,0.07) 0%, transparent 55%),
        radial-gradient(ellipse at 85% 10%, rgba(255,130,0,0.04) 0%, transparent 50%)
      `,
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0b0b10; }
        input:focus { outline: none; border-color: rgba(230,0,0,0.55) !important; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 3px; }
      `}</style>

      {/* ── HEADER ── */}
      <header style={{
        background: "rgba(0,0,0,0.85)",
        borderBottom: "2px solid #e60000",
        position: "sticky", top: 0, zIndex: 100,
        backdropFilter: "blur(12px)",
      }}>
        <div style={{ maxWidth: 1140, margin: "0 auto", display: "flex", alignItems: "stretch" }}>
          {/* Logo */}
          <div style={{
            background: "#e60000",
            padding: "14px 36px 14px 20px",
            clipPath: "polygon(0 0, calc(100% - 16px) 0, 100% 100%, 0 100%)",
            display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
          }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: "#fff", letterSpacing: -1 }}>F1</span>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.75)", letterSpacing: 3 }}>FANTASY LEAGUE</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: 2 }}>2026 SEASON</div>
            </div>
          </div>
          {/* Tabs */}
          <nav style={{ display: "flex", flex: 1, alignItems: "center", paddingLeft: 8 }}>
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                background: "none", border: "none",
                borderBottom: tab === t.id ? "3px solid #e60000" : "3px solid transparent",
                color: tab === t.id ? "#fff" : "rgba(255,255,255,0.4)",
                padding: "20px 18px 17px",
                cursor: "pointer", fontSize: 12, fontWeight: 700,
                letterSpacing: 1.5, textTransform: "uppercase",
                fontFamily: "inherit", transition: "color 0.15s",
              }}>{t.label}</button>
            ))}
          </nav>
          {/* Refresh */}
          {tab !== "setup" && (
            <div style={{ display: "flex", alignItems: "center", padding: "0 20px", gap: 10 }}>
              {updated && !loading && (
                <span style={{ fontSize: 10, color: "#555", letterSpacing: 0.5 }}>Updated {updated}</span>
              )}
              <button onClick={refresh} disabled={loading} style={{
                ...S.ghost,
                borderColor: "rgba(230,0,0,0.4)",
                color: loading ? "#444" : "#e60000",
              }}>
                {loading ? "…" : "↻ Refresh"}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── MAIN ── */}
      <main style={{ maxWidth: 1140, margin: "0 auto", padding: "36px 24px" }}>

        {/* Error */}
        {error && (
          <div style={{
            background: "rgba(230,0,0,0.1)", border: "1px solid rgba(230,0,0,0.3)",
            borderRadius: 6, padding: "12px 18px", marginBottom: 24,
            fontSize: 13, color: "#ff8888", lineHeight: 1.5,
          }}>{error}</div>
        )}

        {/* ── SETUP ── */}
        {tab === "setup" && (
          <div>
            <div style={{ marginBottom: 36 }}>
              <div style={S.label}>2026 Season</div>
              <h1 style={{ fontSize: 42, fontWeight: 900, margin: "6px 0 8px", letterSpacing: -0.5 }}>League Setup</h1>
              <p style={{ color: "#666", fontSize: 14, lineHeight: 1.5 }}>
                Add participants and assign up to 6 drivers each.<br />
                Fantasy points are the sum of those drivers' real F1 championship points.
              </p>
            </div>

            {/* Form */}
            <div style={{ ...S.card, padding: 26, marginBottom: 28 }}>
              <div style={{ ...S.label, marginBottom: 16 }}>
                {editIdx !== null ? "✏ Edit Participant" : "＋ Add Participant"}
              </div>
              <input
                placeholder="Participant name…"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveParticipant()}
                style={{ ...S.input, marginBottom: 14 }}
              />
              <div style={{ ...S.label, marginBottom: 10 }}>Driver Picks (up to 6)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                {formPicks.map((pick, i) => (
                  <input
                    key={i}
                    list="f1-drivers"
                    placeholder={`Pick ${i + 1}`}
                    value={pick}
                    onChange={(e) => {
                      const u = [...formPicks];
                      u[i] = e.target.value;
                      setFormPicks(u);
                    }}
                    style={S.input}
                  />
                ))}
              </div>
              <datalist id="f1-drivers">
                {F1_2026_DRIVERS.map((d) => <option key={d} value={d} />)}
              </datalist>
              <div style={{ display: "flex", gap: 10 }}>
                <button style={S.btn} onClick={saveParticipant}>
                  {editIdx !== null ? "Save Changes" : "Add Participant"}
                </button>
                {editIdx !== null && (
                  <button style={S.ghost} onClick={cancelEdit}>Cancel</button>
                )}
              </div>
            </div>

            {/* Participant list */}
            {participants.length === 0 ? (
              <div style={{ textAlign: "center", padding: "50px 0", color: "#444", fontSize: 14 }}>
                No participants yet — add your first one above.
              </div>
            ) : (
              <>
                <div style={{ ...S.label, marginBottom: 12 }}>
                  {participants.length} Participant{participants.length !== 1 ? "s" : ""}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {participants.map((p, i) => (
                    <div key={i} style={{
                      ...S.card, padding: "16px 20px",
                      display: "flex", alignItems: "center", gap: 16,
                    }}>
                      <div style={{
                        width: 36, height: 36, background: "#e60000", borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 900, fontSize: 15, flexShrink: 0,
                      }}>{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 6 }}>{p.name}</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {p.picks.map((d, j) => (
                            <span key={j} style={{
                              background: "rgba(255,255,255,0.07)",
                              border: "1px solid rgba(255,255,255,0.1)",
                              borderRadius: 4, padding: "3px 10px", fontSize: 12, color: "#ccc",
                            }}>{d}</span>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={S.ghost} onClick={() => startEdit(i)}>Edit</button>
                        <button
                          style={{ ...S.ghost, color: "#e60000", borderColor: "rgba(230,0,0,0.3)" }}
                          onClick={() => setParticipants((prev) => prev.filter((_, x) => x !== i))}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 28, textAlign: "center" }}>
                  <button style={{ ...S.btn, padding: "14px 48px", fontSize: 15 }} onClick={() => setTab("league")}>
                    View League Table →
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── LEAGUE TABLE ── */}
        {tab === "league" && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <div style={S.label}>Fantasy</div>
              <h1 style={{ fontSize: 38, fontWeight: 900, margin: "6px 0", letterSpacing: -0.5 }}>League Table</h1>
              <p style={{ color: "#666", fontSize: 14 }}>
                {participants.length} participant{participants.length !== 1 ? "s" : ""} · Points = sum of picked drivers' F1 championship points
              </p>
            </div>
            {participants.length === 0 ? (
              <Empty msg="No participants set up yet." onAction={() => setTab("setup")} actionLabel="Go to Setup" />
            ) : loading ? (
              <Spinner msg={loadMsg} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {/* Column headers */}
                <div style={{
                  display: "grid", gridTemplateColumns: "56px 220px 1fr 90px",
                  gap: 14, padding: "8px 20px",
                  fontSize: 9, letterSpacing: 2, color: "#555", fontWeight: 700, textTransform: "uppercase",
                }}>
                  <span>Pos</span><span>Participant</span><span>Drivers & Points</span><span style={{ textAlign: "right" }}>Total</span>
                </div>
                {leagueTable.map((p, i) => (
                  <div key={i} style={{
                    ...S.card,
                    display: "grid", gridTemplateColumns: "56px 220px 1fr 90px",
                    gap: 14, alignItems: "center", padding: "18px 20px",
                    background: i === 0 ? "rgba(255,215,0,0.05)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${i === 0 ? "rgba(255,215,0,0.2)" : "rgba(255,255,255,0.07)"}`,
                  }}>
                    <Badge rank={p.rank} />
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{p.name}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {p.picks.map((d, j) => {
                        const last = d.toLowerCase().split(" ").slice(-1)[0];
                        const ds = drivers.find((x) => x.name?.toLowerCase().includes(last));
                        return (
                          <span key={j} style={{
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.09)",
                            borderRadius: 4, padding: "3px 9px", fontSize: 12, color: "#bbb",
                          }}>
                            {d}{ds ? <span style={{ color: "#ff8800", marginLeft: 4 }}>{ds.points}pts</span> : ""}
                          </span>
                        );
                      })}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 28, fontWeight: 900, color: i === 0 ? "#FFD700" : "#fff" }}>{p.pts}</div>
                      <div style={{ fontSize: 9, color: "#555", letterSpacing: 1.5, textTransform: "uppercase" }}>points</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── RACE RESULTS ── */}
        {tab === "races" && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <div style={S.label}>2026 Season</div>
              <h1 style={{ fontSize: 38, fontWeight: 900, margin: "6px 0", letterSpacing: -0.5 }}>Race Results</h1>
            </div>
            {loading ? (
              <Spinner msg={loadMsg} />
            ) : races.length === 0 ? (
              <Empty msg="No completed races yet for the 2026 season." onAction={refresh} actionLabel="Try Refreshing" />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[...races].reverse().map((race) => (
                  <div key={race.round} style={{ ...S.card, overflow: "hidden" }}>
                    <div style={{
                      background: "rgba(230,0,0,0.1)", borderBottom: "1px solid rgba(230,0,0,0.2)",
                      padding: "14px 20px", display: "flex", alignItems: "center", gap: 14,
                    }}>
                      <div style={{
                        background: "#e60000", color: "#fff",
                        fontWeight: 900, fontSize: 11, padding: "4px 10px", borderRadius: 4,
                      }}>R{race.round}</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>{race.name}</div>
                        <div style={{ fontSize: 12, color: "#777", marginTop: 2 }}>{race.location} · {race.date}</div>
                      </div>
                    </div>
                    <div style={{ padding: "0 20px 16px" }}>
                      <div style={{
                        display: "grid", gridTemplateColumns: "40px 1fr 1fr 80px 70px",
                        gap: 10, padding: "12px 0 8px",
                        fontSize: 9, letterSpacing: 1.5, color: "#555", fontWeight: 700, textTransform: "uppercase",
                        borderBottom: "1px solid rgba(255,255,255,0.05)",
                      }}>
                        <span>Pos</span><span>Driver</span><span>Team</span>
                        <span style={{ textAlign: "center" }}>Grid</span>
                        <span style={{ textAlign: "right" }}>Pts</span>
                      </div>
                      {(race.results || []).map((r, i) => (
                        <div key={i} style={{
                          display: "grid", gridTemplateColumns: "40px 1fr 1fr 80px 70px",
                          gap: 10, alignItems: "center", padding: "10px 0",
                          borderBottom: "1px solid rgba(255,255,255,0.03)",
                        }}>
                          <Badge rank={r.pos} />
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{r.driver}</div>
                          <div style={{ fontSize: 13, color: "#777" }}>{r.team}</div>
                          <div style={{ textAlign: "center", fontSize: 13, color: "#666" }}>P{r.grid}</div>
                          <div style={{ textAlign: "right", fontWeight: 700, fontSize: 15, color: r.points > 0 ? "#ff8800" : "#555" }}>
                            {r.points}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── STANDINGS ── */}
        {tab === "standings" && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <div style={S.label}>2026 Season</div>
              <h1 style={{ fontSize: 38, fontWeight: 900, margin: "6px 0", letterSpacing: -0.5 }}>Championship Standings</h1>
            </div>
            {loading ? (
              <Spinner msg={loadMsg} />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
                {/* Drivers */}
                <div>
                  <div style={{ ...S.label, marginBottom: 12 }}>🏎 Drivers Championship</div>
                  {drivers.length === 0 ? (
                    <div style={{ color: "#555", fontSize: 13, padding: "20px 0" }}>No data yet — try refreshing.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {drivers.map((d, i) => (
                        <div key={i} style={{ ...S.card, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                          <Badge rank={d.pos} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{d.name}</div>
                            <div style={{ fontSize: 12, color: "#666" }}>{d.team}</div>
                          </div>
                          <div style={{ fontWeight: 900, fontSize: 22, color: i === 0 ? "#FFD700" : "#eee" }}>{d.points}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* Constructors */}
                <div>
                  <div style={{ ...S.label, marginBottom: 12 }}>🏗 Constructors Championship</div>
                  {teams.length === 0 ? (
                    <div style={{ color: "#555", fontSize: 13, padding: "20px 0" }}>No data yet — try refreshing.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {teams.map((t, i) => (
                        <div key={i} style={{ ...S.card, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 4, height: 38, background: teamColor(t.name), borderRadius: 2, flexShrink: 0 }} />
                          <Badge rank={t.pos} />
                          <div style={{ flex: 1, fontWeight: 700, fontSize: 15, color: teamColor(t.name) }}>{t.name}</div>
                          <div style={{ fontWeight: 900, fontSize: 22, color: i === 0 ? "#FFD700" : "#eee" }}>{t.points}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
