import { useCallback, useEffect, useMemo, useState } from "react";
import { suggestNames } from "./unmask.js";
import { expiryStatus, groupsOf, highlightsOf, ownerNameOf } from "./fields.js";
import { assessVehicle } from "./risk.js";
import { addRecent, clearRecent, readRecent } from "./recent.js";
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

const rcFromUrl = () => {
  const path = window.location.pathname.match(/^\/rc\/([A-Za-z0-9]+)/);
  if (path) return normalizeRc(path[1]);
  return normalizeRc(
    new URLSearchParams(window.location.search).get("rc") || "",
  );
};

export default function App() {
  const [rc, setRc] = useState(() => rcFromUrl());
  const [touched, setTouched] = useState(false);
  const [data, setData] = useState(null);
  const [queried, setQueried] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showNames, setShowNames] = useState(false);
  const [recent, setRecent] = useState(readRecent);
  const [copied, setCopied] = useState(false);

  const check = useMemo(() => validateRc(rc), [rc]);
  const owner = data ? ownerNameOf(data) : "";
  const stateCode = queried.slice(0, 2);

  const suggestions = useMemo(
    () => (owner ? suggestNames(owner, { stateCode }) : null),
    [owner, stateCode],
  );
  const risk = useMemo(() => assessVehicle(data), [data]);
  const highlights = useMemo(() => (data ? highlightsOf(data) : []), [data]);
  const groups = useMemo(() => (data ? groupsOf(data) : []), [data]);

  const lookup = useCallback(async (value) => {
    setLoading(true);
    setError("");
    setData(null);
    setShowNames(false);
    setCopied(false);
    try {
      const res = await fetch(`/api/lookup?rc=${encodeURIComponent(value)}`);
      const json = await res.json().catch(() => null);

      // The source returns an "error" body both for unknown numbers and when
      // its own upstream is unreachable.
      if (json?.error) {
        throw new Error(
          /timed out|network error|connection/i.test(json.error)
            ? "The vehicle data service is temporarily unreachable. Please try again in a few minutes."
            : json.error,
        );
      }
      if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
      if (!json || typeof json !== "object" || Object.keys(json).length === 0) {
        throw new Error("No details found for this number.");
      }
      setData(json);
      setQueried(value);
      setRecent(
        addRecent(value, json["Maker Model"] || json["Model Name"] || ""),
      );
      window.history.replaceState(null, "", `/rc/${value}`);
      logSearch(value, true);
    } catch (err) {
      logSearch(value, false);
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Deep link: /rc/KA02MQ1724 loads that vehicle straight away.
  useEffect(() => {
    const initial = rcFromUrl();
    if (initial && validateRc(initial).valid) lookup(initial);
  }, [lookup]);

  function onChange(event) {
    const next = normalizeRc(event.target.value);
    // Reject keystrokes that cannot lead to a valid registration number.
    if (!isTypableRc(next)) return;
    setRc(next);
  }

  function onSubmit(event) {
    event.preventDefault();
    setTouched(true);
    if (!check.valid) {
      setError(check.message);
      return;
    }
    lookup(check.rc);
  }

  function runRecent(value) {
    setRc(value);
    setTouched(false);
    lookup(value);
  }

  async function share() {
    const url = `${window.location.origin}/rc/${queried}`;
    const title = `${queried} · ${data?.["Maker Model"] || "Vehicle details"}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        /* dismissed - fall through to copying */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy the link.");
    }
  }

  return (
    <div className="page">
      <header className="header">
        <h1>Vehicle Details Check</h1>
        <p>
          RC details, pending challans and a buyer&apos;s risk report for any
          Indian registration number.
        </p>
      </header>

      <form className="search no-print" onSubmit={onSubmit}>
        <input
          value={rc}
          onChange={onChange}
          onBlur={() => setTouched(true)}
          placeholder="KA02MX3710"
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

      <p className={`hint no-print${touched && !check.valid ? " error" : ""}`}>
        {touched && !check.valid
          ? check.message
          : "Formats: KA02MX3710 (standard) or 22BH1234A (BH series)."}
      </p>

      {recent.length > 0 && !data && !loading && (
        <div className="recent no-print">
          <div className="recent-head">
            <span className="muted">Recently checked</span>
            <button
              type="button"
              className="link"
              onClick={() => setRecent(clearRecent())}
            >
              Clear
            </button>
          </div>
          <div className="chips">
            {recent.map((item) => (
              <button
                type="button"
                className="chip clickable"
                key={item.rc}
                onClick={() => runRecent(item.rc)}
              >
                <strong>{item.rc}</strong>
                {item.label && <span className="muted"> · {item.label}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="alert">{error}</p>}

      {risk && (
        <section className={`card verdict ${risk.verdict.tone}`}>
          <div className="verdict-head">
            <div
              className="score"
              aria-label={`Score ${risk.score} out of 100`}
            >
              <strong>{risk.score}</strong>
              <span>/100</span>
            </div>
            <div>
              <h2>{risk.verdict.label}</h2>
              <p className="muted">{risk.verdict.summary}</p>
            </div>
          </div>
          <ul className="findings">
            {risk.findings.map((finding) => (
              <li className={`finding ${finding.severity}`} key={finding.title}>
                <span className="dot" aria-hidden="true" />
                <div>
                  <strong>{finding.title}</strong>
                  <p>{finding.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && (
        <section className="card">
          <div className="card-head">
            <span className="plate">{queried}</span>
            <span className="muted">
              {data["Maker Model"] || data["Model Name"] || "Vehicle details"}
            </span>
            <div className="actions no-print">
              <button type="button" className="link" onClick={share}>
                {copied ? "Link copied" : "Share"}
              </button>
              <button
                type="button"
                className="link"
                onClick={() => window.print()}
              >
                Save as PDF
              </button>
            </div>
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
              className="ghost no-print"
              type="button"
              onClick={() => setShowNames(true)}
            >
              Find matching names
            </button>
          ) : (
            <>
              {suggestions.parts.map((part, index) => (
                <div className="part" key={`${part.token}-${index}`}>
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
                  <h3>Top match</h3>
                  <div className="top-name">{suggestions.combinations[0]}</div>
                  {suggestions.combinations.length > 1 && (
                    <>
                      <h3 className="alt-heading">
                        Other possible names
                        <span className="muted">
                          {" "}
                          · {suggestions.combinations.length - 1} more
                        </span>
                      </h3>
                      <div className="chips">
                        {suggestions.combinations.slice(1).map((name) => (
                          <span className="chip solid" key={name}>
                            {name}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              <p className="note">{suggestions.note}</p>
            </>
          )}
        </section>
      )}

      <footer className="footer">
        <p>
          Data comes from public RTO sources and may be incomplete or out of
          date. Verify with the RTO before any purchase.
        </p>
        <p className="muted">
          Searched registration numbers are logged to detect abuse. Nothing is
          sold or shared.
        </p>
      </footer>
    </div>
  );
}
