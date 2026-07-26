/**
 * الطاولة — عرض اللاعبين حول الطاولة، ومحرر ترتيب الجلوس بالسحب.
 */

import { useRef, useState } from 'react';
import type { PlayerPublic } from '../../game/types';
import { Character } from './Character';
import './table.css';

/* ── حلقة اللاعبين حول الطاولة (شاشة المضيف) ── */

export function SeatRing({
  players,
  highlight = [],
  dim = [],
  caption,
}: {
  players: PlayerPublic[];
  /** لاعبون يُبرزون: مثلًا أصحاب أعلى الأصوات */
  highlight?: string[];
  /** لاعبون يُخفتون: منقطعون أو مستبعدون */
  dim?: string[];
  caption?: string;
}) {
  const count = Math.max(players.length, 1);

  return (
    <div className="seat-ring" style={{ '--seats': count } as React.CSSProperties}>
      <div className="seat-ring__table">
        {caption && <span className="seat-ring__caption">{caption}</span>}
      </div>
      {players.map((player, index) => {
        // المقعد 0 في الأسفل ثم تتوزع البقية **مع عقارب الساعة**.
        // يُستخدم `left` لا `inset-inline-start` عمدًا: الأخير يعكس الحلقة في RTL
        // فتصبح عكس عقارب الساعة، وهو ما يقلب معنى «يمينك» و«يسارك» على المضيف.
        // نصف القطر الأفقي 36% لا 41%: المقعد نفسه بعرض ~90px، والقيمة الأكبر
        // تدفع المقاعد الجانبية خارج الصندوق فيظهر تمرير أفقي على الشاشات المتوسطة.
        const angle = (index / count) * 2 * Math.PI + Math.PI / 2;
        const x = 50 + 36 * Math.cos(angle);
        const y = 50 + 39 * Math.sin(angle);
        return (
          <div
            key={player.id}
            className="seat-ring__seat"
            style={{ left: `${x}%`, top: `${y}%` }}
            data-highlight={highlight.includes(player.id) || undefined}
            data-dim={dim.includes(player.id) || !player.connected || undefined}
          >
            <Character characterId={player.avatarId} size={78} still state="idle" />
            <span className="seat-ring__name">{player.name}</span>
            {!player.connected && <span className="seat-ring__flag">منقطع</span>}
          </div>
        );
      })}
    </div>
  );
}

/* ── بطاقة لاعب في قائمة ── */

export function PlayerCard({
  player,
  status,
  selected = false,
  onSelect,
  disabled = false,
}: {
  player: PlayerPublic;
  status?: string;
  selected?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
}) {
  const Tag = onSelect ? 'button' : 'div';

  return (
    <Tag
      className="player-card"
      data-selected={selected || undefined}
      data-offline={!player.connected || undefined}
      onClick={onSelect}
      disabled={onSelect ? disabled : undefined}
      type={onSelect ? 'button' : undefined}
      aria-pressed={onSelect ? selected : undefined}
    >
      <Character characterId={player.avatarId} size={56} still state={selected ? 'startled' : 'idle'} />
      <span className="player-card__text">
        <strong>{player.name}</strong>
        {/* لا يُعرض اسم الشخصية هنا: اللاعبون يعرفون بعضهم بأسمائهم لا بشخصياتهم */}
        {status && <small>{status}</small>}
      </span>
      {selected && <span className="player-card__tick">✓</span>}
    </Tag>
  );
}

/* ── محرر ترتيب الجلوس بالسحب ── */

export function SeatingEditor({
  players,
  onReorder,
}: {
  players: PlayerPublic[];
  onReorder: (fromSeat: number, toSeat: number) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  function indexFromPoint(clientY: number): number | null {
    const items = listRef.current?.querySelectorAll('li');
    if (!items) return null;
    for (let i = 0; i < items.length; i++) {
      const rect = items[i]!.getBoundingClientRect();
      if (clientY < rect.bottom) return i;
    }
    return items.length - 1;
  }

  return (
    <ol className="seating" ref={listRef}>
      {players.map((player, index) => (
        <li
          key={player.id}
          className="seating__item"
          data-dragging={dragIndex === index || undefined}
          data-over={overIndex === index && dragIndex !== index ? true : undefined}
          onPointerDown={(event) => {
            if (!(event.target as HTMLElement).closest('.seating__handle')) return;
            (event.target as HTMLElement).setPointerCapture(event.pointerId);
            setDragIndex(index);
          }}
          onPointerMove={(event) => {
            if (dragIndex === null) return;
            setOverIndex(indexFromPoint(event.clientY));
          }}
          onPointerUp={() => {
            if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
              onReorder(dragIndex, overIndex);
            }
            setDragIndex(null);
            setOverIndex(null);
          }}
          onPointerCancel={() => {
            setDragIndex(null);
            setOverIndex(null);
          }}
        >
          <span className="seating__seat">{index + 1}</span>
          <Character characterId={player.avatarId} size={46} still />
          <span className="seating__name">{player.name}</span>
          <span className="seating__spacer" />
          <button
            type="button"
            className="seating__move"
            aria-label={`حرّك ${player.name} للأعلى`}
            disabled={index === 0}
            onClick={() => onReorder(index, index - 1)}
          >
            ▲
          </button>
          <button
            type="button"
            className="seating__move"
            aria-label={`حرّك ${player.name} للأسفل`}
            disabled={index === players.length - 1}
            onClick={() => onReorder(index, index + 1)}
          >
            ▼
          </button>
          <span
            className="seating__handle"
            role="button"
            tabIndex={0}
            aria-label={`اسحب ${player.name} لتغيير مقعده`}
          >
            ⣿
          </span>
        </li>
      ))}
    </ol>
  );
}
