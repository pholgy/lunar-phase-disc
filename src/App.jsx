import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import './App.css';

// ============================================
// Constants & Utility Functions
// ============================================

const SYNODIC_MONTH = 29.53059;
const DAYS_PER_PHASE = 15;
const DEG_PER_DAY = 360 / DAYS_PER_PHASE; // 24°
const WAXING_HOURS = [12, 13, 14, 15, 16, 17, 18, 7, 8, 9, 10, 11];
const WANING_HOURS = [24, 1, 2, 3, 4, 5, 6, 19, 20, 21, 22, 23];

function getLunarAge(date = new Date()) {
  const ref = new Date('2000-01-06T18:14:00Z').getTime();
  const diffDays = (date.getTime() - ref) / 86400000;
  return ((diffDays % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
}

function getTodayLunarDay() {
  const age = getLunarAge();
  if (age < SYNODIC_MONTH / 2) {
    return { phase: 'waxing', day: Math.min(Math.floor(age / (SYNODIC_MONTH / 2) * 15) + 1, 15) };
  }
  const waningAge = age - SYNODIC_MONTH / 2;
  return { phase: 'waning', day: Math.min(Math.floor(waningAge / (SYNODIC_MONTH / 2) * 15) + 1, 15) };
}

function getMoonriseTime(phase, day) {
  const step = (12 * 60) / 14; // ~51.43 minutes per day
  let totalMin;
  if (phase === 'waxing') {
    totalMin = 6 * 60 + (day - 1) * step;
  } else {
    totalMin = 18 * 60 + (day - 1) * step;
  }
  totalMin = ((totalMin % 1440) + 1440) % 1440;
  return {
    hours: Math.floor(totalMin / 60),
    minutes: Math.round(totalMin % 60),
  };
}

function getIllumination(phase, day) {
  if (phase === 'waxing') return day / DAYS_PER_PHASE;
  return 1 - day / DAYS_PER_PHASE;
}

function moonriseToClockAngle(hours, minutes, phase) {
  const total = hours + minutes / 60;
  const start = phase === 'waxing' ? 7 : 19;
  let h = total;
  if (phase === 'waning' && h < 19) h += 24;
  return ((h - start) * 30 + 210) % 360;
}

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807 + 11) % 2147483647;
    return s / 2147483647;
  };
}

function getPhaseName(phase, day) {
  if (phase === 'waxing') {
    if (day <= 1) return { th: 'จันทร์ดับ → เสี้ยว', en: 'New Crescent' };
    if (day <= 6) return { th: 'จันทร์เสี้ยวข้างขึ้น', en: 'Waxing Crescent' };
    if (day <= 9) return { th: 'จันทร์ครึ่งดวงข้างขึ้น', en: 'First Quarter' };
    if (day <= 14) return { th: 'จันทร์ค่อนดวงข้างขึ้น', en: 'Waxing Gibbous' };
    return { th: 'จันทร์เพ็ญ (เต็มดวง)', en: 'Full Moon' };
  }
  if (day <= 1) return { th: 'จันทร์เพ็ญ → แรม', en: 'Full → Waning' };
  if (day <= 6) return { th: 'จันทร์ค่อนดวงข้างแรม', en: 'Waning Gibbous' };
  if (day <= 9) return { th: 'จันทร์ครึ่งดวงข้างแรม', en: 'Third Quarter' };
  if (day <= 14) return { th: 'จันทร์เสี้ยวข้างแรม', en: 'Waning Crescent' };
  return { th: 'จันทร์ดับ', en: 'New Moon' };
}

// ============================================
// SVG Sub-Components
// ============================================

function MoonPhase({ illumination, isWaxing, r }) {
  const dark = '#1a1a2e';
  const brightColor = '#d8d8d8';

  if (illumination <= 0.02) {
    return (
      <g>
        <circle r={r} fill={dark} />
        <circle r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
      </g>
    );
  }
  if (illumination >= 0.98) {
    return (
      <g>
        <circle r={r} fill="url(#moonGrad)" />
        <circle r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
      </g>
    );
  }

  const termRx = Math.abs(2 * illumination - 1) * r;
  const isCrescent = illumination < 0.5;

  let path;
  if (isWaxing) {
    // Right side bright
    path = `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} A ${termRx} ${r} 0 0 ${isCrescent ? 1 : 0} 0 ${-r}`;
  } else {
    // Left side bright
    path = `M 0 ${-r} A ${r} ${r} 0 0 0 0 ${r} A ${termRx} ${r} 0 0 ${isCrescent ? 0 : 1} 0 ${-r}`;
  }

  return (
    <g>
      <circle r={r} fill={dark} />
      <path d={path} fill={brightColor} />
      {/* Subtle moon texture overlay */}
      <circle r={r} fill="url(#moonTexture)" opacity="0.3" />
      <circle r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
    </g>
  );
}

function Stars({ stars }) {
  return (
    <g>
      {stars.map((s, i) => (
        <circle
          key={i}
          cx={s.x}
          cy={s.y}
          r={s.r}
          fill="white"
          opacity={s.opacity}
          className={s.twinkle ? 'star-twinkle' : ''}
          style={s.twinkle ? { animation: `twinkle ${2 + s.delay}s ease-in-out ${s.delay}s infinite` } : {}}
        />
      ))}
    </g>
  );
}

function SpaceDecorations({ phase }) {
  const isWaxing = phase === 'waxing';
  return (
    <g opacity="0.35">
      {/* Saturn */}
      <g transform="translate(175, -185)">
        <circle r="14" fill="none" stroke="white" strokeWidth="1.2" />
        <ellipse rx="24" ry="6" fill="none" stroke="white" strokeWidth="0.8" transform="rotate(-20)" />
      </g>

      {/* Jupiter */}
      <g transform="translate(-185, -170)">
        <circle r="16" fill="none" stroke="white" strokeWidth="1.2" />
        <line x1="-16" y1="-4" x2="16" y2="-4" stroke="white" strokeWidth="0.5" opacity="0.6" />
        <line x1="-16" y1="4" x2="16" y2="4" stroke="white" strokeWidth="0.5" opacity="0.6" />
        <line x1="-14" y1="10" x2="14" y2="10" stroke="white" strokeWidth="0.5" opacity="0.4" />
      </g>

      {/* Crescent moon decoration */}
      <g transform="translate(-220, 20)">
        <path d="M 0,-18 A 18,18 0 1,1 0,18 A 12,18 0 1,0 0,-18" fill="none" stroke="white" strokeWidth="1" />
        <circle cx="-8" cy="-22" r="2" fill="none" stroke="white" strokeWidth="0.5" />
        <circle cx="-14" cy="-28" r="1" fill="none" stroke="white" strokeWidth="0.5" />
      </g>

      {/* Shooting star */}
      <g transform="translate(190, 160) rotate(-35)">
        <line x1="0" y1="0" x2="45" y2="0" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="45" y1="0" x2="60" y2="0" stroke="white" strokeWidth="0.5" opacity="0.3" />
        <circle cx="-2" cy="0" r="3" fill="white" opacity="0.6" />
      </g>

      {/* Constellation */}
      <g transform="translate(-170, 140)">
        {[[0,0],[18,-20],[38,-8],[32,18],[10,22]].map(([x,y], i) => (
          <circle key={i} cx={x} cy={y} r="1.5" fill="white" />
        ))}
        <polyline points="0,0 18,-20 38,-8 32,18 10,22 0,0" fill="none" stroke="white" strokeWidth="0.5" strokeDasharray="2,3" />
      </g>

      {/* Sparkles */}
      {[
        [140, -100, 10], [-130, -130, 8], [100, 200, 7],
        [-200, 120, 6], [220, -40, 9], [-100, 200, 7],
      ].map(([x, y, size], i) => (
        <g key={i} transform={`translate(${x}, ${y})`}>
          <line x1={-size} y1="0" x2={size} y2="0" stroke="white" strokeWidth="0.8" />
          <line x1="0" y1={-size} x2="0" y2={size} stroke="white" strokeWidth="0.8" />
          <line x1={-size * 0.4} y1={-size * 0.4} x2={size * 0.4} y2={size * 0.4} stroke="white" strokeWidth="0.4" />
          <line x1={size * 0.4} y1={-size * 0.4} x2={-size * 0.4} y2={size * 0.4} stroke="white" strokeWidth="0.4" />
        </g>
      ))}

      {/* Sun icon at bottom of space area */}
      <g transform="translate(0, 190)">
        <circle r="12" fill="none" stroke={isWaxing ? '#FFD700' : 'rgba(255,200,50,0.5)'} strokeWidth="1.5" />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * 45 - 90) * Math.PI / 180;
          return (
            <line
              key={i}
              x1={Math.cos(a) * 16}
              y1={Math.sin(a) * 16}
              x2={Math.cos(a) * 22}
              y2={Math.sin(a) * 22}
              stroke={isWaxing ? '#FFD700' : 'rgba(255,200,50,0.5)'}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          );
        })}
      </g>
    </g>
  );
}

function ClockFace({ phase, clockAngle }) {
  const hours = phase === 'waxing' ? WAXING_HOURS : WANING_HOURS;
  const clockR = 120;
  const numberR = 95;

  return (
    <g>
      {/* Clock background */}
      <circle r={clockR} fill="white" />
      <circle r={clockR} fill="none" stroke="#ccc" strokeWidth="2" />

      {/* Minute ticks */}
      {Array.from({ length: 60 }, (_, i) => {
        const angle = (i * 6 - 90) * Math.PI / 180;
        const isHourMark = i % 5 === 0;
        const outer = clockR - 5;
        const inner = isHourMark ? clockR - 16 : clockR - 10;
        return (
          <line
            key={i}
            x1={Math.cos(angle) * inner}
            y1={Math.sin(angle) * inner}
            x2={Math.cos(angle) * outer}
            y2={Math.sin(angle) * outer}
            stroke={isHourMark ? '#333' : '#aaa'}
            strokeWidth={isHourMark ? 2 : 0.5}
          />
        );
      })}

      {/* Hour numbers */}
      {hours.map((hour, i) => {
        const angle = (i * 30 - 90) * Math.PI / 180;
        const x = Math.cos(angle) * numberR;
        const y = Math.sin(angle) * numberR;
        return (
          <text
            key={i}
            x={x}
            y={y}
            className="clock-hour"
            style={{ fontSize: '13px' }}
          >
            {hour}
          </text>
        );
      })}

      {/* Clock hand */}
      <g transform={`rotate(${clockAngle})`}>
        <line
          x1="0" y1="8"
          x2="0" y2={-(clockR - 25)}
          stroke="#2a5298"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {/* Arrow tip */}
        <polygon
          points={`0,${-(clockR - 20)} -5,${-(clockR - 32)} 5,${-(clockR - 32)}`}
          fill="#2a5298"
        />
      </g>

      {/* Center dot */}
      <circle r="5" fill="#333" />
      <circle r="3" fill="#555" />
    </g>
  );
}

// ============================================
// Main App Component
// ============================================

export default function App() {
  const today = useMemo(() => getTodayLunarDay(), []);
  const [phase, setPhase] = useState(today.phase);
  const [selectedDay, setSelectedDay] = useState(today.day);
  const [discRotation, setDiscRotation] = useState(-(today.day - 1) * DEG_PER_DAY);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef(null);
  const svgRef = useRef(null);

  // Generate stars once
  const stars = useMemo(() => {
    const rand = seededRandom(42);
    return Array.from({ length: 150 }, () => {
      const angle = rand() * Math.PI * 2;
      const dist = 140 + rand() * 230;
      return {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        r: 0.3 + rand() * 1.5,
        opacity: 0.15 + rand() * 0.5,
        twinkle: rand() > 0.75,
        delay: rand() * 3,
      };
    });
  }, []);

  // Derived values
  const moonrise = getMoonriseTime(phase, selectedDay);
  const clockAngle = moonriseToClockAngle(moonrise.hours, moonrise.minutes, phase);
  const phaseName = getPhaseName(phase, selectedDay);
  const isToday = phase === today.phase && selectedDay === today.day;

  // Select a day (animate rotation)
  const selectDay = useCallback((day) => {
    setSelectedDay(day);
    setDiscRotation(-(day - 1) * DEG_PER_DAY);
  }, []);

  // Toggle phase
  const togglePhase = useCallback((newPhase) => {
    if (newPhase === phase) return;
    setPhase(newPhase);
    setSelectedDay(1);
    setDiscRotation(0);
  }, [phase]);

  // Drag handlers
  const getAngleFromEvent = useCallback((e) => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return Math.atan2(clientY - cy, clientX - cx) * 180 / Math.PI;
  }, []);

  const handlePointerDown = useCallback((e) => {
    // Only start drag if clicking in the moon ring area
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const svgScale = rect.width / 800;
    const normalizedDist = dist / svgScale;

    // Only drag if in the moon ring area (roughly r=260 to r=380)
    if (normalizedDist < 240 || normalizedDist > 400) return;

    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    dragRef.current = { startAngle: angle, startRotation: discRotation };
    setIsDragging(true);

    if (e.preventDefault) e.preventDefault();
  }, [discRotation]);

  const handlePointerMove = useCallback((e) => {
    if (!isDragging || !dragRef.current) return;
    const angle = getAngleFromEvent(e);
    let delta = angle - dragRef.current.startAngle;
    // Handle angle wrapping
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    setDiscRotation(dragRef.current.startRotation + delta);
    if (e.preventDefault) e.preventDefault();
  }, [isDragging, getAngleFromEvent]);

  const handlePointerUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    dragRef.current = null;

    // Snap to nearest day
    const normalized = ((discRotation % 360) + 360) % 360;
    const nearestIndex = Math.round(normalized / DEG_PER_DAY) % DAYS_PER_PHASE;
    // The rotation is negative of (day-1)*24, so:
    // day = 1 corresponds to rotation=0, day=2 to rotation=-24, etc.
    // Normalized: rotation 0 -> day 1, rotation 336 -> day 2 (since -24 mod 360 = 336)
    const dayFromRotation = ((DAYS_PER_PHASE - nearestIndex) % DAYS_PER_PHASE) + 1;
    const clampedDay = Math.max(1, Math.min(DAYS_PER_PHASE, dayFromRotation));
    setSelectedDay(clampedDay);
    setDiscRotation(-(clampedDay - 1) * DEG_PER_DAY);
  }, [isDragging, discRotation]);

  // Attach global pointer events for drag
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e) => handlePointerMove(e);
    const onUp = () => handlePointerUp();

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [isDragging, handlePointerMove, handlePointerUp]);

  const moonR = 310; // radius where moons are placed
  const moonSize = 26; // individual moon radius

  return (
    <div className="app">
      <div className="title">
        <h1>Lunar Phase Disc</h1>
        <h2>นาฬิกาข้างขึ้น-ข้างแรม</h2>
      </div>

      <div
        className="disc-container"
        onMouseDown={handlePointerDown}
        onTouchStart={handlePointerDown}
      >
        <svg
          ref={svgRef}
          viewBox="-400 -400 800 800"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Space gradient */}
            <radialGradient id="spaceGrad" cx="50%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#0f1b3d" />
              <stop offset="100%" stopColor="#060a1a" />
            </radialGradient>

            {/* Moon surface gradient */}
            <radialGradient id="moonGrad" cx="40%" cy="35%">
              <stop offset="0%" stopColor="#f0f0f0" />
              <stop offset="50%" stopColor="#d8d8d8" />
              <stop offset="100%" stopColor="#b8b8b8" />
            </radialGradient>

            {/* Moon texture */}
            <radialGradient id="moonTexture" cx="30%" cy="30%">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="40%" stopColor="rgba(0,0,0,0.05)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.15)" />
            </radialGradient>

            {/* Glow filter for selected moon */}
            <filter id="moonGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
              <feFlood floodColor="#4a9eff" floodOpacity="0.5" />
              <feComposite in2="blur" operator="in" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Outer glow for disc border */}
            <filter id="discGlow" x="-5%" y="-5%" width="110%" height="110%">
              <feGaussianBlur stdDeviation="3" />
              <feFlood floodColor="#1a3a6e" floodOpacity="0.4" />
              <feComposite operator="in" in2="SourceAlpha" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Curved text path for phase label */}
            <path
              id="phaseTextPath"
              d="M -220,0 A 220,220 0 0,1 220,0"
              transform="rotate(145)"
              fill="none"
            />
          </defs>

          {/* Background disc */}
          <circle r="385" fill="url(#spaceGrad)" />
          <circle r="385" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />

          {/* Stars */}
          <Stars stars={stars} />

          {/* Space decorations in the middle area */}
          <SpaceDecorations phase={phase} />

          {/* Subtle separator ring */}
          <circle r="250" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          <circle r="145" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

          {/* Curved phase text */}
          <text fill="rgba(255,255,255,0.25)" fontSize="18" fontWeight="300" fontFamily="Kanit, sans-serif">
            <textPath href="#phaseTextPath" startOffset="50%" textAnchor="middle">
              {phase === 'waxing' ? 'ข้างขึ้น waxing moon' : 'ข้างแรม waning moon'}
            </textPath>
          </text>

          {/* Window highlight at top */}
          <g>
            <rect
              x={-moonSize - 12}
              y={-moonR - moonSize - 12}
              width={(moonSize + 12) * 2}
              height={(moonSize + 12) * 2}
              rx="12"
              fill="none"
              stroke="rgba(74, 158, 255, 0.3)"
              strokeWidth="2"
              strokeDasharray="4,4"
            />
            {/* Small triangle pointer */}
            <polygon
              points={`0,${-moonR + moonSize + 16} -8,${-moonR + moonSize + 26} 8,${-moonR + moonSize + 26}`}
              fill="rgba(74, 158, 255, 0.3)"
            />
          </g>

          {/* Moon phase ring - rotatable */}
          <g
            className={`moon-ring ${isDragging ? 'dragging' : ''}`}
            style={{ transform: `rotate(${discRotation}deg)` }}
          >
            {Array.from({ length: DAYS_PER_PHASE }, (_, i) => {
              const dayNum = i + 1;
              const angle = i * DEG_PER_DAY - 90; // -90 so day 1 starts at top
              const rad = angle * Math.PI / 180;
              const x = Math.cos(rad) * moonR;
              const y = Math.sin(rad) * moonR;
              const isSelected = dayNum === selectedDay;
              const illum = getIllumination(phase, dayNum);
              const isWaxing = phase === 'waxing';

              // Position for day number (outside the moon)
              const numR = moonR + moonSize + 14;
              const nx = Math.cos(rad) * numR;
              const ny = Math.sin(rad) * numR;

              return (
                <g key={i}>
                  {/* Moon */}
                  <g
                    className="moon-group"
                    transform={`translate(${x}, ${y}) rotate(${-discRotation})`}
                    onClick={(e) => { e.stopPropagation(); selectDay(dayNum); }}
                    opacity={isSelected ? 1 : 0.55}
                    filter={isSelected ? 'url(#moonGlow)' : 'none'}
                  >
                    <g transform={`scale(${isSelected ? 1.2 : 1})`}>
                      <MoonPhase
                        illumination={illum}
                        isWaxing={isWaxing}
                        r={moonSize}
                      />
                    </g>
                  </g>

                  {/* Day number */}
                  <text
                    x={nx}
                    y={ny}
                    className={`day-number ${isSelected ? 'selected' : ''}`}
                    transform={`rotate(${-discRotation}, ${nx}, ${ny})`}
                    onClick={(e) => { e.stopPropagation(); selectDay(dayNum); }}
                    style={{ cursor: 'pointer' }}
                  >
                    {dayNum}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Clock face */}
          <ClockFace phase={phase} clockAngle={clockAngle} />
        </svg>
      </div>

      {/* Info Panel */}
      <div className="info-panel">
        <div className="info-phase">
          {phase === 'waxing' ? 'ข้างขึ้น' : 'ข้างแรม'} {selectedDay} ค่ำ
        </div>
        <div className="info-phase-en">
          {phaseName.en} &middot; Day {selectedDay}
        </div>
        <div className="info-moonrise">
          <span>Moonrise</span>
          <span className="time">
            {String(moonrise.hours).padStart(2, '0')}:{String(moonrise.minutes).padStart(2, '0')} น.
          </span>
        </div>
        {isToday && <div className="today-badge">TODAY</div>}
      </div>

      {/* Phase Toggle */}
      <div className="toggle-container">
        <button
          className={`toggle-btn ${phase === 'waxing' ? 'active' : ''}`}
          onClick={() => togglePhase('waxing')}
        >
          ข้างขึ้น Waxing
        </button>
        <button
          className={`toggle-btn ${phase === 'waning' ? 'active' : ''}`}
          onClick={() => togglePhase('waning')}
        >
          ข้างแรม Waning
        </button>
      </div>

      {/* Day selector buttons */}
      <div className="day-selector">
        {Array.from({ length: DAYS_PER_PHASE }, (_, i) => (
          <button
            key={i}
            className={`day-btn ${selectedDay === i + 1 ? 'active' : ''}`}
            onClick={() => selectDay(i + 1)}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
