"use client";

import { useEffect, useRef, useState } from "react";

type Feature = { title: string; description: string };

export function MarketingFeatureRail({ features }: { features: Feature[] }) {
  const rail = useRef<HTMLUListElement>(null);
  const [position, setPosition] = useState({ atStart: true, atEnd: false });

  useEffect(() => {
    const list = rail.current;
    if (!list) return;
    const updatePosition = () => {
      const atStart = list.scrollLeft <= 1;
      const atEnd = list.scrollLeft + list.clientWidth >= list.scrollWidth - 1;
      setPosition((previous) => previous.atStart === atStart && previous.atEnd === atEnd ? previous : { atStart, atEnd });
    };
    const observer = new ResizeObserver(updatePosition);
    observer.observe(list);
    list.addEventListener("scroll", updatePosition, { passive: true });
    return () => {
      observer.disconnect();
      list.removeEventListener("scroll", updatePosition);
    };
  }, []);

  function move(direction: -1 | 1) {
    const list = rail.current;
    const [first, second] = list?.children ?? [];
    if (!list || !first || !second) return;
    const distance = second.getBoundingClientRect().left - first.getBoundingClientRect().left;
    list.scrollBy({ left: distance * direction });
  }

  return (
    <>
      <div className="marketing-features-controls">
        <button type="button" className="button button-secondary" aria-label="Recurso anterior" aria-controls="marketing-feature-list" disabled={position.atStart} onClick={() => move(-1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
        </button>
        <button type="button" className="button button-secondary" aria-label="Próximo recurso" aria-controls="marketing-feature-list" disabled={position.atEnd} onClick={() => move(1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
        </button>
      </div>
      <ul className="marketing-feature-list" id="marketing-feature-list" ref={rail} tabIndex={0} aria-label="Funcionalidades do Rankaê" role="list">
        {features.map(({ title, description }) => (
          <li key={title}><h3>{title}</h3><p>{description}</p></li>
        ))}
      </ul>
    </>
  );
}
