"use client";

import { useEffect, useRef, useState } from "react";

const clips = [
  "https://videos.pexels.com/video-files/35607635/15089925_2304_1080_30fps.mp4",
  "https://videos.pexels.com/video-files/29556479/12722806_1920_1080_25fps.mp4",
] as const;

export function MarketingVideo() {
  const videos = useRef<Array<HTMLVideoElement | null>>([]);
  const [active, setActive] = useState(0);
  const switching = useRef(false);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (motion.matches || connection?.saveData) {
      videos.current.forEach((video) => video?.pause());
      return;
    }
    void videos.current[0]?.play().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!switching.current) return;
    const previous = videos.current[1 - active];
    const timeout = window.setTimeout(() => {
      previous?.pause();
      if (previous) previous.currentTime = 0;
      switching.current = false;
    }, 1100);
    return () => window.clearTimeout(timeout);
  }, [active]);

  function prepareNext() {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (!connection?.saveData && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      videos.current[1]?.load();
    }
  }

  function onProgress(index: number) {
    if (index !== active || switching.current) return;
    const current = videos.current[index];
    const next = videos.current[1 - index];
    if (!current || !next || !Number.isFinite(current.duration) || current.duration - current.currentTime > 1.2 || next.readyState < 2) return;
    switching.current = true;
    next.currentTime = 0;
    void next.play().then(() => setActive(1 - index)).catch(() => { switching.current = false; });
  }

  return <div className="marketing-video-stage" aria-hidden="true">
    {clips.map((src, index) => <video
      key={src}
      ref={(element) => { videos.current[index] = element; }}
      className={`marketing-video ${active === index ? "is-active" : ""}`}
      src={src}
      muted
      playsInline
      loop
      preload={index === 0 ? "metadata" : "none"}
      onCanPlay={index === 0 ? prepareNext : undefined}
      onTimeUpdate={() => onProgress(index)}
    />)}
  </div>;
}
