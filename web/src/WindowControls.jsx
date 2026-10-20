import { useEffect, useState } from "react";

export default function WindowControls() {
  const api = typeof window !== "undefined" ? window.desktopWindow : null;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!api) return undefined;
    let alive = true;
    api.isMaximized().then((value) => {
      if (alive) setMaximized(Boolean(value));
    });
    const unsubscribe = api.onMaximized((value) => {
      if (alive) setMaximized(value);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [api]);

  if (!api) return null;

  return (
    <div className="win-controls">
      <button type="button" aria-label="最小化" onClick={() => api.minimize()}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 8h11" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={maximized ? "还原" : "最大化"}
        onClick={() => api.toggleMaximize()}
      >
        {maximized ? (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M5 3.5h7.5V11" />
            <rect x="3" y="5" width="8" height="8" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="3" y="3" width="10" height="10" />
          </svg>
        )}
      </button>
      <button type="button" className="close" aria-label="关闭" onClick={() => api.close()}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
        </svg>
      </button>
    </div>
  );
}
