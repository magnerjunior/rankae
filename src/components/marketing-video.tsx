"use client";

import { useEffect, useRef, useState } from "react";

const clips = [
  "https://videos.pexels.com/video-files/39709897/16930050_1920_1080_30fps.mp4",
  "https://videos.pexels.com/video-files/17446487/17446487-hd_1080_1920_60fps.mp4",
] as const;

export function MarketingVideo() {
  const videos = useRef<Array<HTMLVideoElement | null>>([]);
  const [active, setActive] = useState(0);
  const switching = useRef(false);
  const nextPrepared = useRef(false);

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
    const next = videos.current[1];
    if (next && !nextPrepared.current && !connection?.saveData && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      nextPrepared.current = true;
      next.load();
    }
  }

  function hasBufferedOpening(video: HTMLVideoElement) {
    for (let index = 0; index < video.buffered.length; index += 1) {
      if (video.buffered.start(index) <= 0.1 && video.buffered.end(index) >= Math.min(2.5, video.duration - 0.1)) return true;
    }
    return false;
  }

  function onProgress(index: number) {
    if (index !== active || switching.current) return;
    const current = videos.current[index];
    const next = videos.current[1 - index];
    if (!current || !next || !Number.isFinite(current.duration) || current.duration - current.currentTime > 1.2 || !hasBufferedOpening(next)) return;
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
      onPlaying={() => {
        if (index === 0 && active === 0) prepareNext();
      }}
      onTimeUpdate={() => onProgress(index)}
    />)}
  </div>;
}
