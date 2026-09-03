import { useMemo, useState } from "react";
import { suggestNames } from "./unmask.js";
import { expiryStatus, groupsOf, highlightsOf, ownerNameOf } from "./fields.js";
import {
  MAX_RC_LENGTH,
  isTypableRc,
  normalizeRc,
  validateRc,
} from "./rcNumber.js";

// Fire-and-forget; a logging failure must never affect the lookup.
function logSearch(rc, found) {
  fetch("/api/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rc, found }),
    keepalive: true,
  }).catch(() => {});
}

export default function App() {
  const [rc, setRc] = useState("");
  const [touched, setTouched] = useState(false);
  const [data, setData] = useState(null);
  const [queried, setQueried] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showNames, setShowNames] = useState(false);

  const check = useMemo(() => validateRc(rc), [rc]);

  const owner = data ? ownerNameOf(data) : "";
  const suggestions = useMemo(
    () => (owner ? suggestNames(owner) : null),
    [owner],
  );

  function onChange(event) {
    const next = normalizeRc(event.target.value);
    // Reject keystrokes that cannot lead to a valid registration number.
    if (!isTypableRc(next)) return;
    setRc(next);
  }

  async function onSubmit(event) {
    event.preventDefault();
    setTouched(true);
    if (!check.valid) {
      setError(check.message);
      return;
    }
    const value = check.rc;
    setLoading(true);
    setError("");
    setData(null);
    setShowNames(false);
    try {
      const res = await fetch(`/api/lookup?rc=${encodeURIComponent(value)}`);
      if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
      const json = await res.json();
      if (!json || typeof json !== "object" || Object.keys(json).length === 0) {
        throw new Error("No details found for this number.");
      }
      setData(json);
      setQueried(value);
      logSearch(value, true);
    } catch (err) {
      logSearch(value, false);
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const highlights = useMemo(() => (data ? highlightsOf(data) : []), [data]);
  const groups = useMemo(() => (data ? groupsOf(data) : []), [data]);

  return (
    <div className="page">
      <header className="header">
        <h1>Vehicle Check</h1>
        <p>Enter a vehicle registration number to fetch its RC details.</p>
      </header>

      <form className="search" onSubmit={onSubmit}>
        <input
          value={rc}
          onChange={onChange}
          onBlur={() => setTouched(true)}
          placeholder="KA02MX3713"
          aria-label="Vehicle or RC number"
          aria-invalid={touched && !check.valid}
          className={touched && rc && !check.valid ? "invalid" : ""}
          maxLength={MAX_RC_LENGTH}
          inputMode="text"
          autoComplete="off"
          spellCheck="false"
        />
        <button type="submit" disabled={loading || !check.valid}>
          {loading ? "Checking…" : "Check"}
        </button>
      </form>

      <p className={`hint${touched && !check.valid ? " error" : ""}`}>
        {touched && !check.valid
          ? check.message
          : "Formats: KA02MX3713 (standard) or 22BH1234A (BH series)."}
      </p>

      {error && <p className="alert">{error}</p>}

      {data && (
        <section className="card">
          <div className="card-head">
            <span className="plate">{queried}</span>
            <span className="muted">
              {data["Maker Model"] || data["Model Name"] || "Vehicle details"}
            </span>
          </div>
          <div className="highlights">
            {highlights.map(({ key, label, value }) => {
              const status = expiryStatus(key, value);
              return (
                <div className="highlight" key={label}>
                  <span className="label">{label}</span>
                  <strong>{value}</strong>
                  {status && (
                    <span className={`pill ${status.tone}`}>
                      {status.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {groups.map((group) => (
            <div className="group" key={group.title}>
              <h2>{group.title}</h2>
              <dl className="details">
                {group.rows.map(([key, value]) => {
                  const status = expiryStatus(key, value);
                  return (
                    <div className="detail" key={key}>
                      <dt>{key}</dt>
                      <dd>
                        {value}
                        {status && (
                          <span className={`pill ${status.tone}`}>
                            {status.label}
                          </span>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}
        </section>
      )}

      {suggestions?.hasMask && (
        <section className="card">
          <div className="card-head">
            <span className="plate">Masked owner</span>
            <span className="muted">{suggestions.masked}</span>
          </div>
          {!showNames ? (
            <button
              className="ghost"
              type="button"
              onClick={() => setShowNames(true)}
            >
              Find matching names
            </button>
          ) : (
            <>
              {suggestions.parts.map((part, i) => (
                <div className="part" key={`${part.token}-${i}`}>
                  <h3>
                    {part.token}
                    {part.masked && (
                      <span className="muted"> · {part.total} matches</span>
                    )}
                  </h3>
                  {part.masked ? (
                    part.candidates.length ? (
                      <div className="chips">
                        {part.candidates.map((name) => (
                          <span className="chip" key={name}>
                            {name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="muted">No dictionary match.</p>
                    )
                  ) : (
                    <p className="muted">Not masked.</p>
                  )}
                </div>
              ))}
              {suggestions.combinations.length > 0 && (
                <div className="part">
                  <h3>Possible full names</h3>
                  <div className="chips">
                    {suggestions.combinations.map((name) => (
                      <span className="chip solid" key={name}>
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <p className="note">{suggestions.note}</p>
            </>
          )}
        </section>
      )}

      <footer className="footer">
        Data is fetched from a public RC lookup API. Use responsibly.
      </footer>
    </div>
  );
}
