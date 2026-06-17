import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";

/**
 * Warm-Hive 404 (screen 18 family). Reskin only — keeps the useLocation +
 * console.error 404 logging behavior and the `NotFound` default export.
 * Warm tokens only (D21): big honey "404", on-brand copy, a back-to-Home link,
 * and a ⌘K affordance hint.
 */
const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="flex flex-col items-center text-center">
        <div className="font-display text-[88px] font-bold leading-none tracking-[-0.04em] text-primary">
          404
        </div>
        <h1 className="mb-2 mt-3 font-display text-2xl font-semibold">This cell of the hive is empty.</h1>
        <p className="mb-6 max-w-[40ch] text-[14.5px] text-[var(--text-muted)]">
          The page you&rsquo;re after doesn&rsquo;t exist — but your memory and workspaces are right where you
          left them.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <Link
            to="/home"
            className="rounded-[11px] bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            &larr; Back to Home
          </Link>
          <span className="rounded-[11px] border border-[var(--line-strong)] bg-[var(--surface)] px-5 py-2.5 text-sm font-semibold text-[var(--text-2)]">
            Search with <kbd className="font-mono">⌘K</kbd>
          </span>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
