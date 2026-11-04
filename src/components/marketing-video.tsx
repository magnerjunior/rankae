"use client";

import { useEffect, useRef, useState } from "react";

const clips = [
  "https://videos.pexels.com/video-files/35607635/15089925_2304_1080_30fps.mp4",
  "/videos/drible-society.mp4",
  "/videos/gol-society.mp4",
  "/videos/pelada-vista-alto.mp4",
] as const;
const clipStarts = [3.2, 0, 0, 0] as const;

export function MarketingVideo() {
  const videos = useRef<Array<HTMLVideoElement | null>>([]);
  const [active, setActive] = useState(0);
  const switching = useRef(false);
  const prepared = useRef(new Set<number>());

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
    const previous = videos.current[(active - 1 + clips.length) % clips.length];
    const timeout = window.setTimeout(() => {
      previous?.pause();
      if (previous) previous.currentTime = 0;
      switching.current = false;
    }, 1100);
    return () => window.clearTimeout(timeout);
  }, [active]);

  function prepareNext(index: number) {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const next = videos.current[index];
    if (next && !prepared.current.has(index) && !connection?.saveData && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      prepared.current.add(index);
      next.load();
    }
  }

  function hasBufferedOpening(video: HTMLVideoElement, start: number) {
    for (let index = 0; index < video.buffered.length; index += 1) {
      if (video.buffered.start(index) <= start + 0.1 && video.buffered.end(index) >= Math.min(start + 2.5, video.duration - 0.1)) return true;
    }
    return false;
  }

  function onProgress(index: number) {
    if (index !== active || switching.current) return;
    const current = videos.current[index];
    const nextIndex = (index + 1) % clips.length;
    const next = videos.current[nextIndex];
    if (!current || !next || !Number.isFinite(current.duration) || current.duration - current.currentTime > 1.2 || !hasBufferedOpening(next, clipStarts[nextIndex])) return;
    switching.current = true;
    next.currentTime = clipStarts[nextIndex];
    void next.play().then(() => setActive(nextIndex)).catch(() => { switching.current = false; });
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
      onLoadedMetadata={(event) => {
        if (clipStarts[index] > 0) event.currentTarget.currentTime = clipStarts[index];
      }}
      onPlaying={() => prepareNext((index + 1) % clips.length)}
      onTimeUpdate={() => onProgress(index)}
    />)}
  </div>;
}

export function FriendsVideo() {
  const video = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || connection?.saveData) return;
    void video.current?.play().catch(() => undefined);
  }, []);

  return <video ref={video} className="marketing-friends-video" src="/videos/amigos-celular.mp4" muted playsInline loop preload="metadata" aria-hidden="true" />;
}
