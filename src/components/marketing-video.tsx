"use client";

import { useEffect, useRef, useState } from "react";

const clips = [
  "/videos/drible-society.mp4",
  "/videos/gol-society.mp4",
  "/videos/pelada-vista-alto.mp4",
  "https://videos.pexels.com/video-files/35607635/15089925_2304_1080_30fps.mp4",
] as const;
const clipStarts = [0, 0, 0, 3.2] as const;

export function MarketingVideo() {
  const stage = useRef<HTMLDivElement | null>(null);
  const videos = useRef<Array<HTMLVideoElement | null>>([]);
  const [active, setActive] = useState(0);
  const switching = useRef(false);
  const previousClip = useRef<number | undefined>(undefined);
  const prepared = useRef(new Set<number>());
  const failed = useRef(new Set<number>());

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches || !stage.current) {
      videos.current.forEach((clip) => clip?.pause());
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      const video = videos.current[active];
      if (!entry.isIntersecting) {
        videos.current.forEach((clip) => clip?.pause());
        return;
      }
      void video?.play().catch(() => undefined);
    });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [active]);

  useEffect(() => {
    if (!switching.current) return;
    const previous = previousClip.current === undefined ? null : videos.current[previousClip.current];
    const timeout = window.setTimeout(() => {
      previous?.pause();
      if (previous) previous.currentTime = 0;
      previousClip.current = undefined;
      switching.current = false;
    }, 1100);
    return () => window.clearTimeout(timeout);
  }, [active]);

  function nextAvailable(index: number) {
    for (let offset = 1; offset < clips.length; offset++) {
      const next = (index + offset) % clips.length;
      if (!failed.current.has(next)) return next;
    }
  }

  function prepareNext(index: number | undefined) {
    if (index === undefined) return;
    const next = videos.current[index];
    if (next && !prepared.current.has(index) && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
    const nextIndex = nextAvailable(index);
    if (nextIndex === undefined) return;
    const next = videos.current[nextIndex];
    if (!current || !next || !Number.isFinite(current.duration) || current.duration - current.currentTime > 1.2 || !hasBufferedOpening(next, clipStarts[nextIndex])) return;
    switching.current = true;
    previousClip.current = index;
    next.currentTime = clipStarts[nextIndex];
    void next.play().then(() => setActive(nextIndex)).catch(() => { switching.current = false; });
  }

  return <div ref={stage} className="marketing-video-stage" aria-hidden="true">
    {clips.map((src, index) => <video
      key={src}
      ref={(element) => { videos.current[index] = element; }}
      className={`marketing-video ${active === index ? "is-active" : ""}`}
      src={src}
      muted
      playsInline
      loop
      preload="none"
      onLoadedMetadata={(event) => {
        if (clipStarts[index] > 0) event.currentTarget.currentTime = clipStarts[index];
      }}
      onPlaying={() => prepareNext(nextAvailable(index))}
      onError={() => {
        failed.current.add(index);
        const next = nextAvailable(active);
        if (next === undefined) return;
        if (index === active) setActive(next);
        else if (!videos.current[active]?.paused) prepareNext(next);
      }}
      onTimeUpdate={() => onProgress(index)}
    />)}
  </div>;
}

export function FriendsVideo() {
  const video = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const clip = video.current;
    if (!clip) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      clip.pause();
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void clip.play().catch(() => undefined);
      else clip.pause();
    });
    observer.observe(clip);
    return () => observer.disconnect();
  }, []);

  return <video ref={video} className="marketing-friends-video" src="/videos/amigos-celular.mp4" muted playsInline loop preload="none" aria-hidden="true" />;
}
