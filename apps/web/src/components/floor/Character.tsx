import type { PresenceStatus } from '@vo/shared';
import { PRESENCE_COLORS } from '@vo/shared';
import type { CSSProperties } from 'react';

const SKIN = ['#F1C7A5', '#E0AC85', '#C68B62', '#9C6644', '#F3D2B8'];
const HAIR = ['#2B2118', '#4A3222', '#1C1C1C', '#6B4423', '#8A5A2B'];
const SHIRT = ['#2563EB', '#0F766E', '#B45309', '#7C3AED', '#BE185D', '#15803D', '#334155', '#C2410C'];
const SUIT = ['#1F2937', '#1E3A5F', '#3F3F46', '#312E81'];

export function hashName(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export type CharacterRole = 'host' | 'leader' | 'staff';

export interface CharacterProps {
  name: string;
  label: string;
  role: CharacterRole;
  status: PresenceStatus;
  isMe: boolean;
  selected: boolean;
  walking: boolean;
  facing: 'left' | 'right';
  inMeeting: boolean;
  talkDelay: string;
  summoned: boolean;
  accent: string;
  /** position, transitions and the 3D billboard transform */
  style: CSSProperties;
  ariaLabel: string;
  onClick: () => void;
}

/** One person on the floor, drawn like the mockup: a little figure with a status badge and a name tag. */
export function Character(p: CharacterProps) {
  const h = hashName(p.name);
  const hairKind = (h >> 7) % 3;
  const hair = HAIR[(h >> 3) % HAIR.length];
  const formal = p.role !== 'staff';
  const host = p.role === 'host';
  const away = p.status === 'AWAY';
  const busy = p.status === 'BUSY';
  const brk = p.status === 'ON_BREAK';
  const abs = (s: CSSProperties): CSSProperties => ({ position: 'absolute', ...s });

  let tag: CSSProperties;
  if (p.isMe) tag = { background: p.accent, color: '#FFFFFF' };
  else if (host) tag = { background: '#1F3A5F', color: '#FFFFFF' };
  else if (formal) tag = { background: '#FFF6DD', color: '#7A5200', boxShadow: '0 0 0 1px #D4A017' };
  else tag = { background: 'rgba(255,255,255,0.95)', color: '#1B2230', boxShadow: '0 0 0 1px #DCDFD8' };

  return (
    <button type="button" className="vo-char" aria-label={p.ariaLabel} title={p.ariaLabel} aria-pressed={p.selected} onClick={p.onClick} style={p.style}>
      <span
        style={abs({
          left: 8,
          top: 50,
          width: 24,
          height: 7,
          borderRadius: '50%',
          background: p.selected ? p.accent : 'rgba(27,34,48,0.2)',
          boxShadow: p.selected ? `0 0 0 3px ${p.accent}55` : undefined,
        })}
      />
      <span style={abs({ left: 0, top: 0, width: 40, height: 56, transform: `scaleX(${p.facing === 'left' ? -1 : 1})` })}>
        <span
          className={p.walking ? 'vo-body vo-walk' : 'vo-body vo-idle'}
          style={abs({ left: 0, top: 0, width: 40, height: 56, animationDelay: `-${((h % 20) / 10).toFixed(1)}s`, filter: away ? 'saturate(0.35)' : undefined })}
        >
          <span className="vo-leg-l" style={abs({ left: 13, top: 42, width: 6, height: 11, borderRadius: 3, background: '#2F3A4A' })} />
          <span className="vo-leg-r" style={abs({ left: 21, top: 42, width: 6, height: 11, borderRadius: 3, background: '#2F3A4A' })} />
          <span style={abs({ left: 10, top: 27, width: 20, height: 18, borderRadius: '9px 9px 4px 4px', background: formal ? SUIT[h % SUIT.length] : SHIRT[(h >> 5) % SHIRT.length] })} />
          {formal && <span style={abs({ left: 18, top: 28, width: 4, height: 11, borderRadius: '0 0 2px 2px', background: host ? '#FFFFFF' : '#B91C1C' })} />}
          {hairKind === 1 && !host && <span style={abs({ left: 7, top: 8, width: 26, height: 17, borderRadius: 7, background: hair })} />}
          <span style={abs({ left: 10, top: 8, width: 20, height: 20, borderRadius: '50%', background: SKIN[h % SKIN.length] })} />
          <span className="vo-eye" style={abs({ left: 15, top: 18, width: 3, height: 4, borderRadius: 2, background: '#1F2937', animationDelay: `-${((h % 46) / 10).toFixed(1)}s` })} />
          <span className="vo-eye" style={abs({ left: 22, top: 18, width: 3, height: 4, borderRadius: 2, background: '#1F2937', animationDelay: `-${((h % 46) / 10).toFixed(1)}s` })} />
          <span style={abs({ left: 9, top: 5, width: 22, height: 11, borderRadius: '11px 11px 5px 5px', background: host ? '#6B7280' : hair })} />
          {hairKind === 2 && !host && <span style={abs({ left: 15, top: 0, width: 10, height: 9, borderRadius: '50%', background: hair })} />}
          {busy && (
            <>
              <span style={abs({ left: 7, top: 3, width: 26, height: 14, boxSizing: 'border-box', border: '3px solid #1F2937', borderBottomColor: 'transparent', borderRadius: '13px 13px 0 0' })} />
              <span style={abs({ left: 5, top: 13, width: 7, height: 10, borderRadius: 3, background: '#1F2937' })} />
              <span style={abs({ left: 28, top: 13, width: 7, height: 10, borderRadius: 3, background: '#1F2937' })} />
            </>
          )}
          {brk && (
            <>
              <span className="vo-steam" style={abs({ left: 29, top: 22, width: 2, height: 6, borderRadius: 1, background: 'rgba(100,116,139,0.7)' })} />
              <span className="vo-steam" style={abs({ left: 33, top: 22, width: 2, height: 6, borderRadius: 1, background: 'rgba(100,116,139,0.7)', animationDelay: '0.9s' })} />
              <span style={abs({ left: 27, top: 30, width: 9, height: 10, boxSizing: 'border-box', borderRadius: '1px 1px 3px 3px', background: '#FFFFFF', border: '1.5px solid #8B5E3C' })} />
            </>
          )}
        </span>
      </span>
      <span
        style={abs({
          left: 28,
          top: 2,
          width: 11,
          height: 11,
          boxSizing: 'border-box',
          borderRadius: '50%',
          boxShadow: '0 0 0 2px #FFFFFF',
          ...(away ? { background: '#FFFFFF', border: `2px solid ${PRESENCE_COLORS.AWAY}` } : { background: PRESENCE_COLORS[p.status] }),
        })}
      >
        {busy && <span style={abs({ left: 2, right: 2, top: 4.5, height: 2, borderRadius: 1, background: '#FFFFFF' })} />}
      </span>
      {away && (
        <>
          <span className="vo-zzz" style={abs({ left: 26, top: -4, fontSize: 11, fontWeight: 700, color: '#586171' })}>z</span>
          <span className="vo-zzz" style={abs({ left: 30, top: -8, fontSize: 9, fontWeight: 700, color: '#586171', animationDelay: '1.3s' })}>z</span>
        </>
      )}
      {p.inMeeting && (
        <span
          className="vo-talk"
          style={abs({ left: 20, top: -17, width: 26, height: 15, boxSizing: 'border-box', border: '1px solid #C9CEC4', borderRadius: '8px 8px 8px 2px', background: '#FFFFFF', color: '#6D28D9', fontSize: 10, fontWeight: 700, lineHeight: '12px', letterSpacing: 1, textAlign: 'center', animationDelay: p.talkDelay })}
        >
          •••
        </span>
      )}
      {p.summoned && (
        <span className="vo-bell" style={abs({ left: 1, top: -14, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', background: '#B45309', color: '#FFFFFF' })}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" />
            <path d="M10 20a2 2 0 0 0 4 0" />
          </svg>
        </span>
      )}
      <span
        style={abs({ left: '50%', top: 57, transform: 'translateX(-50%)', padding: '1px 7px', borderRadius: 999, fontSize: 11, fontWeight: 600, lineHeight: '15px', whiteSpace: 'nowrap', ...tag })}
      >
        {p.label}
      </span>
    </button>
  );
}
