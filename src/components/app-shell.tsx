"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Condition, ConditionsResponse } from "@/lib/conditions";

type Audience = "people" | "dogs";
type SourceState = {
  status: "live" | "snapshot";
  checkedAt: string;
  message?: string;
  live?: Array<{ id: string; title: string; modified: string; url: string }>;
};

const quickSearches = ["Clear Lake", "Sacramento River", "Lake Tahoe", "Lake Berryessa"];

function prettyDate(value: string | null) {
  if (!value) return "No dated evidence";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function prettyDateTime(value: string | null) {
  if (!value) return "Unavailable";
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
    timeZoneName: "short",
  }).format(new Date(normalized));
}

function relativeDate(value: string | null) {
  if (!value) return "No recent result";
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).valueOf()) / 86_400_000));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 45) return `${days} days ago`;
  return prettyDate(value);
}

function ConditionCard({
  condition,
  audience,
  saved,
  onOpen,
  onSave,
}: {
  condition: Condition;
  audience: Audience;
  saved: boolean;
  onOpen: () => void;
  onSave: () => void;
}) {
  return (
    <article className={`condition-card tone-${condition.tone}`}>
      <button className="card-hitarea" onClick={onOpen} aria-label={`View ${condition.name}`} />
      <div className="card-topline">
        <span className="status-chip"><span className="status-dot" />{condition.label}</span>
        <button
          className={`save-button ${saved ? "is-saved" : ""}`}
          onClick={(event) => { event.stopPropagation(); onSave(); }}
          aria-label={saved ? `Remove ${condition.name} from saved spots` : `Save ${condition.name}`}
        >
          {saved ? "♥" : "♡"}
        </button>
      </div>
      <h3>{condition.name}</h3>
      <p className="station-line">{condition.subtitle}</p>
      <p className="guidance">{audience === "people" ? condition.human : condition.dog}</p>
      <div className="card-footer">
        <span>{condition.distanceMiles !== undefined ? `${condition.distanceMiles.toFixed(1)} mi away` : relativeDate(condition.updatedAt)}</span>
        <span className="open-link">See evidence <span aria-hidden="true">→</span></span>
      </div>
    </article>
  );
}

function EvidencePanel({
  condition,
  audience,
  onClose,
}: {
  condition: Condition;
  audience: Audience;
  onClose: () => void;
}) {
  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="evidence-sheet" role="dialog" aria-modal="true" aria-label={`${condition.name} evidence`} onMouseDown={(event) => event.stopPropagation()}>
        <button className="sheet-close" onClick={onClose} aria-label="Close evidence panel">×</button>
        <p className="eyebrow">Evidence, not a guarantee</p>
        <h2>{condition.name}</h2>
        <div className={`decision-block tone-${condition.tone}`}>
          <span className="status-chip"><span className="status-dot" />{condition.label}</span>
          <p>{audience === "people" ? condition.human : condition.dog}</p>
        </div>

        <div className="evidence-heading">
          <h3>Bacteria results</h3>
          <span>{condition.readings.length} analyte{condition.readings.length === 1 ? "" : "s"}</span>
        </div>
        {condition.readings.length ? (
          <div className="evidence-list">
            {condition.readings.map((reading) => (
              <div className="evidence-row" key={`${reading.analyte}-${reading.sampledAt}`}>
                <div>
                  <strong>{reading.analyte}</strong>
                  <span>Sampled {prettyDate(reading.sampledAt)}</span>
                </div>
                <div className="measurement">
                  <strong>{reading.result ?? "—"}</strong>
                  <span>{reading.unit || "reported unit"}</span>
                </div>
                <p>{reading.reason}. This is a screening comparison, not a legal compliance finding.</p>
              </div>
            ))}
          </div>
        ) : <p className="muted-copy">No bacteria measurements are attached to this location.</p>}

        <div className="evidence-heading">
          <h3>Harmful algae</h3>
          <span>{condition.bloom ? `${condition.bloom.distanceMiles.toFixed(1)} mi away` : "No nearby report"}</span>
        </div>
        {condition.bloom ? (
          <div className="bloom-box">
            <strong>{condition.bloom.advisory || "No advisory specified"}</strong>
            <p>{condition.bloom.waterBody}{condition.bloom.landmark ? ` · ${condition.bloom.landmark}` : ""}</p>
            <span>Observed {prettyDate(condition.bloom.observedAt)} · Case {condition.bloom.caseStatus || "status unavailable"}</span>
          </div>
        ) : (
          <p className="muted-copy">No bloom report within the matching radius. Absence of a report does not mean absence of algae.</p>
        )}

        <div className="sheet-disclaimer">
          <strong>Before entering any water</strong>
          <p>Look for posted signs. Avoid water after heavy rain and whenever it is green, streaked, foamy, scummy, or foul-smelling. Local health and park authorities have the final word.</p>
        </div>
        <div className="source-actions">
          <a href="https://data.ca.gov/dataset/surface-water-fecal-indicator-bacteria-results" target="_blank" rel="noreferrer">Bacteria dataset ↗</a>
          <a href="https://data.ca.gov/dataset/surface-water-freshwater-harmful-algal-blooms" target="_blank" rel="noreferrer">Algae dataset ↗</a>
        </div>
      </aside>
    </div>
  );
}

export function AppShell({ initialData }: { initialData: ConditionsResponse }) {
  const [audience, setAudience] = useState<Audience>("people");
  const [data, setData] = useState(initialData);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Condition | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [sourceState, setSourceState] = useState<SourceState | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem("before-you-dip:saved");
      if (stored) {
        try { setSaved(JSON.parse(stored)); } catch { /* Ignore malformed local state. */ }
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const visible = useMemo(() => data.conditions, [data]);

  async function search(nextQuery: string, coordinates?: { latitude: number; longitude: number }) {
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({ limit: "48" });
    if (nextQuery) params.set("query", nextQuery);
    if (coordinates) {
      params.set("lat", String(coordinates.latitude));
      params.set("lon", String(coordinates.longitude));
    }
    try {
      const response = await fetch(`/api/conditions?${params}`);
      if (!response.ok) throw new Error("Search request failed");
      const nextData = await response.json() as ConditionsResponse;
      setData(nextData);
      setMessage(nextData.count ? `${nextData.count.toLocaleString()} matching evidence locations` : "No matching evidence locations found");
      document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      setMessage("The search could not be refreshed. The starting snapshot is still available below.");
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void search(query);
  }

  function locate() {
    if (!navigator.geolocation) {
      setMessage("Location is not supported by this browser.");
      return;
    }
    setLoading(true);
    setMessage("Asking your browser for an approximate location…");
    navigator.geolocation.getCurrentPosition(
      (position) => void search("", { latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => { setLoading(false); setMessage("Location was not shared. You can still search by lake, river, park, or station name."); },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  function toggleSaved(id: string) {
    const next = saved.includes(id) ? saved.filter((item) => item !== id) : [...saved, id];
    setSaved(next);
    window.localStorage.setItem("before-you-dip:saved", JSON.stringify(next));
  }

  async function checkSources() {
    setSourceState(null);
    const response = await fetch("/api/sources");
    setSourceState(await response.json());
  }

  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="Before You Dip home">
          <span className="ripple-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>Before You Dip</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#results">Explore</a>
          <a href="#method">How it works</a>
          <a href="#sources">Sources</a>
        </nav>
        <span className="independent-label">Independent public-data project</span>
      </header>

      <section className="hero" id="top">
        <Image src="/assets/hero-reservoir.png" alt="A family and dog pausing at the shore of a California reservoir" fill priority sizes="100vw" />
        <div className="hero-shade" />
        <div className="hero-copy">
          <p className="eyebrow light">California water, made clearer</p>
          <h1>Know what the water knows<br />before you dip.</h1>
          <p className="hero-lede">Recent bacteria results and harmful-algae reports, brought together for people and their dogs.</p>
          <form className="search-box" onSubmit={submit}>
            <label htmlFor="water-search">Search a lake, river, park, or monitoring station</label>
            <div className="search-control">
              <span aria-hidden="true">⌕</span>
              <input id="water-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try “Clear Lake”" />
              <button type="submit" disabled={loading}>{loading ? "Checking…" : "Check the water"}</button>
            </div>
          </form>
          <div className="hero-actions">
            <button className="locate-button" onClick={locate} disabled={loading}><span aria-hidden="true">◎</span> Find monitored spots near me</button>
            <div className="quick-links" aria-label="Popular searches">
              {quickSearches.map((item) => <button key={item} onClick={() => { setQuery(item); void search(item); }}>{item}</button>)}
            </div>
          </div>
        </div>
        <div className="hero-note"><strong>Not an official government service.</strong> Always follow signs and local advisories.</div>
      </section>

      <section className="audience-band" aria-label="Choose guidance for people or dogs">
        <div>
          <p className="eyebrow">Who is getting wet?</p>
          <h2>One shoreline. Different risks.</h2>
        </div>
        <div className="audience-toggle">
          <button className={audience === "people" ? "active" : ""} onClick={() => setAudience("people")}><span aria-hidden="true">●</span> People</button>
          <button className={audience === "dogs" ? "active" : ""} onClick={() => setAudience("dogs")}><span aria-hidden="true">◆</span> Dogs</button>
        </div>
        <p className="audience-explainer">{audience === "people" ? "Human guidance compares recent fecal-indicator bacteria results and posted algae advisories." : "Dog guidance is more cautious around suspected algae because exposure can become serious very quickly."}</p>
      </section>

      <section className="results-section" id="results">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Current evidence finder</p>
            <h2>{data.query ? `Results for “${data.query}”` : "A few places people ask about"}</h2>
          </div>
          <div className="result-meta">
            <span>{message || `${data.count.toLocaleString()} evidence locations searchable`}</span>
            <span>App snapshot built {prettyDateTime(data.generatedAt)}</span>
            <span>Newest source file {prettyDateTime(data.sourceModifiedAt)}</span>
          </div>
        </div>

        {visible.length ? (
          <div className="explore-layout">
            <div className="card-grid">
              {visible.slice(0, 12).map((condition) => (
                <ConditionCard key={condition.id} condition={condition} audience={audience} saved={saved.includes(condition.id)} onOpen={() => setSelected(condition)} onSave={() => toggleSaved(condition.id)} />
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <Image src="/assets/dog-ripples.png" alt="A dog looking at ripples on a lake" width={480} height={480} />
            <div><p className="eyebrow">No exact match</p><h3>Try the water body, nearby park, or station name.</h3><p>The source data is monitoring-based, so not every swimming place has a record.</p><button onClick={() => { setQuery(""); void search(""); }}>Show recent monitored spots</button></div>
          </div>
        )}
      </section>

      <section className="method-section" id="method">
        <div className="method-intro">
          <p className="eyebrow light">What this tool does</p>
          <h2>Two public datasets.<br />One honest answer.</h2>
          <p>Before You Dip does not invent a safety score. It shows the newest available evidence, its age, and why a status appears.</p>
        </div>
        <div className="method-steps">
          <article><span>01</span><h3>Find nearby evidence</h3><p>Search official monitoring stations and match nearby freshwater bloom reports.</p></article>
          <article><span>02</span><h3>Keep the caveats</h3><p>Results older than 45 days become “unknown.” Missing reports never become a green light.</p></article>
          <article><span>03</span><h3>Explain the signal</h3><p>Every status opens to the measurements, dates, comparison lines, and source links behind it.</p></article>
        </div>
      </section>

      <section className="source-section" id="sources">
        <div>
          <p className="eyebrow">The public-data ledger</p>
          <h2>See where every signal comes from.</h2>
          <p className="source-lede">The app discovers current CSV resources through California’s CKAN API, builds a compact station snapshot, and can check the catalog live without requiring an API key.</p>
          <div className="freshness-box">
            <strong>Not real-time</strong>
            <span>App snapshot: {prettyDateTime(data.generatedAt)}</span>
            <span>Newest included source file: {prettyDateTime(data.sourceModifiedAt)}</span>
            <p>Sampling and agency publication schedules vary. Always use posted signs and local advisories for the final decision.</p>
          </div>
          <button className="source-check" onClick={() => void checkSources()}>Check source connection <span aria-hidden="true">↗</span></button>
          {sourceState && <p className={`source-result ${sourceState.status}`}>{sourceState.status === "live" ? `Catalog checked now. Newest catalog update: ${prettyDateTime(sourceState.live?.map((source) => source.modified).sort().at(-1) ?? sourceState.checkedAt)}. This check does not replace the packaged snapshot.` : sourceState.message}</p>}
        </div>
        <div className="source-cards">
          <a href="https://data.ca.gov/dataset/surface-water-fecal-indicator-bacteria-results" target="_blank" rel="noreferrer"><span>Bacteria</span><strong>Fecal Indicator Bacteria Monitoring Results</strong><small>Station samples · rolling means · quality fields</small></a>
          <a href="https://data.ca.gov/dataset/surface-water-freshwater-harmful-algal-blooms" target="_blank" rel="noreferrer"><span>Harmful algae</span><strong>Freshwater Harmful Algal Bloom Reports</strong><small>Bloom observations · advisories · case status</small></a>
          <a href="https://www.waterboards.ca.gov/bacterialobjectives/" target="_blank" rel="noreferrer"><span>Method</span><strong>Statewide Bacteria Objectives</strong><small>Comparison values and official context</small></a>
        </div>
      </section>

      <footer>
        <div className="wordmark"><span className="ripple-mark" aria-hidden="true"><i /><i /><i /></span><span>Before You Dip</span></div>
        <p>Built independently with California public data. Not affiliated with, endorsed by, or speaking for any government agency.</p>
        <a href="#top">Back to top ↑</a>
      </footer>

      {selected && <EvidencePanel condition={selected} audience={audience} onClose={() => setSelected(null)} />}
    </main>
  );
}
