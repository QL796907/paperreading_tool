import { useEffect, useState } from "react";

export default function DesktopUpdateBar() {
  const api = typeof window !== "undefined" ? window.desktopUpdate : null;
  const [version, setVersion] = useState("");
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!api) return undefined;
    let alive = true;
    api.ready().then((value) => {
      if (alive && value) setVersion(value);
    });
    const unsubscribe = api.onReady((value) => {
      if (alive && value) setVersion(value);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [api]);

  useEffect(() => {
    document.documentElement.classList.toggle("has-update", Boolean(version));
    return () => document.documentElement.classList.remove("has-update");
  }, [version]);

  if (!version) return null;

  return (
    <div className="update-bar" role="status">
      <span>新版本 {version} 已下载，可直接更新</span>
      <button
        type="button"
        disabled={installing}
        onClick={() => {
          setInstalling(true);
          api.install();
        }}
      >
        {installing ? "正在更新…" : "现在更新"}
      </button>
    </div>
  );
}
