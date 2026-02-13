import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import './App.css';

// ============================================
// Constants & Utility Functions
// ============================================

const SYNODIC_MONTH = 29.53059;
const DAYS_PER_PHASE = 15;
const DEG_PER_DAY = 360 / DAYS_PER_PHASE;
const WAXING_HOURS = [12, 13, 14, 15, 16, 17, 18, 7, 8, 9, 10, 11];
const WANING_HOURS = [24, 1, 2, 3, 4, 5, 6, 19, 20, 21, 22, 23];
const THAI_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const THAI_MONTHS = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'
];

function getLunarAge(date = new Date()) {
  const ref = new Date('2000-01-06T18:14:00Z').getTime();
  const diffDays = (date.getTime() - ref) / 86400000;
  return ((diffDays % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
}

function getLunarDayForDate(date) {
  const age = getLunarAge(date);
  const half = SYNODIC_MONTH / 2;
  if (age < half) {
    return { phase: 'waxing', day: Math.min(Math.floor(age / half * 15) + 1, 15) };
  }
  const waningAge = age - half;
  return { phase: 'waning', day: Math.min(Math.floor(waningAge / half * 15) + 1, 15) };
}

function getMoonriseTime(phase, day) {
  const step = (12 * 60) / 14;
  let totalMin = phase === 'waxing'
    ? 6 * 60 + (day - 1) * step
    : 18 * 60 + (day - 1) * step;
  totalMin = ((totalMin % 1440) + 1440) % 1440;
  return { hours: Math.floor(totalMin / 60), minutes: Math.round(totalMin % 60) };
}

function getIllumination(phase, day) {
  return phase === 'waxing' ? day / DAYS_PER_PHASE : 1 - day / DAYS_PER_PHASE;
}

function moonriseToClockAngle(hours, minutes, phase) {
  const total = hours + minutes / 60;
  const start = phase === 'waxing' ? 7 : 19;
  let h = total;
  if (phase === 'waning' && h < 19) h += 24;
  return ((h - start) * 30 + 210) % 360;
}

function isWanPhra(day) {
  return day === 8 || day === 15;
}

function getPhaseName(phase, day) {
  if (phase === 'waxing') {
    if (day <= 1) return { th: 'จันทร์เสี้ยว', en: 'New Crescent' };
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

function getWanPhraLabel(phase, day) {
  if (day === 8) return phase === 'waxing' ? 'ขึ้น ๘ ค่ำ' : 'แรม ๘ ค่ำ';
  if (day === 15) return phase === 'waxing' ? 'วันเพ็ญ (ขึ้น ๑๕ ค่ำ)' : 'วันจันทร์ดับ (แรม ๑๕ ค่ำ)';
  return '';
}

function seededRandom(seed) {
  let s = seed;
  return () => { s = (s * 16807 + 11) % 2147483647; return s / 2147483647; };
}

function formatDateThai(date) {
  const d = date.getDate();
  const m = THAI_MONTHS[date.getMonth()];
  const y = date.getFullYear() + 543;
  return `${d} ${m} ${y}`;
}

function toInputDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// ============================================
// SVG Sub-Components
// ============================================

function MoonPhase({ illumination, isWaxing, r }) {
  const dark = '#1a1a2e';
  const brightColor = '#d8d8d8';

  if (illumination <= 0.02) {
    return (<g><circle r={r} fill={dark} /><circle r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" /></g>);
  }
  if (illumination >= 0.98) {
    return (<g><circle r={r} fill="url(#moonGrad)" /><circle r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" /></g>);
  }

  const termRx = Math.abs(2 * illumination - 1) * r;
  const isCrescent = illumination < 0.5;
  const path = isWaxing
    ? `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} A ${termRx} ${r} 0 0 ${isCrescent ? 1 : 0} 0 ${-r}`
    : `M 0 ${-r} A ${r} ${r} 0 0 0 0 ${r} A ${termRx} ${r} 0 0 ${isCrescent ? 0 : 1} 0 ${-r}`;

  return (
    <g>
      <circle r={r} fill={dark} />
      <path d={path} fill={brightColor} />
      <circle r={r} fill="url(#moonTexture)" opacity="0.3" />
      <circle r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
    </g>
  );
}

function MiniMoon({ illumination, isWaxing, size = 16 }) {
  const r = size / 2 - 0.5;
  const cx = size / 2;
  const cy = size / 2;

  if (illumination <= 0.02) {
    return <svg width={size} height={size}><circle cx={cx} cy={cy} r={r} fill="#333" stroke="#555" strokeWidth="0.3" /></svg>;
  }
  if (illumination >= 0.98) {
    return <svg width={size} height={size}><circle cx={cx} cy={cy} r={r} fill="#ccc" stroke="#999" strokeWidth="0.3" /></svg>;
  }

  const termRx = Math.abs(2 * illumination - 1) * r;
  const isCrescent = illumination < 0.5;
  const path = isWaxing
    ? `M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r} A ${termRx} ${r} 0 0 ${isCrescent ? 1 : 0} ${cx} ${cy - r}`
    : `M ${cx} ${cy - r} A ${r} ${r} 0 0 0 ${cx} ${cy + r} A ${termRx} ${r} 0 0 ${isCrescent ? 0 : 1} ${cx} ${cy - r}`;

  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="#333" />
      <path d={path} fill="#ccc" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#555" strokeWidth="0.3" />
    </svg>
  );
}

function Stars({ stars }) {
  return (
    <g>
      {stars.map((s, i) => (
        <circle
          key={i} cx={s.x} cy={s.y} r={s.r} fill="white" opacity={s.opacity}
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
      <g transform="translate(175, -185)">
        <circle r="14" fill="none" stroke="white" strokeWidth="1.2" />
        <ellipse rx="24" ry="6" fill="none" stroke="white" strokeWidth="0.8" transform="rotate(-20)" />
      </g>
      <g transform="translate(-185, -170)">
        <circle r="16" fill="none" stroke="white" strokeWidth="1.2" />
        <line x1="-16" y1="-4" x2="16" y2="-4" stroke="white" strokeWidth="0.5" opacity="0.6" />
        <line x1="-16" y1="4" x2="16" y2="4" stroke="white" strokeWidth="0.5" opacity="0.6" />
      </g>
      <g transform="translate(-220, 20)">
        <path d="M 0,-18 A 18,18 0 1,1 0,18 A 12,18 0 1,0 0,-18" fill="none" stroke="white" strokeWidth="1" />
        <circle cx="-8" cy="-22" r="2" fill="none" stroke="white" strokeWidth="0.5" />
      </g>
      <g transform="translate(190, 160) rotate(-35)">
        <line x1="0" y1="0" x2="45" y2="0" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="-2" cy="0" r="3" fill="white" opacity="0.6" />
      </g>
      <g transform="translate(-170, 140)">
        {[[0,0],[18,-20],[38,-8],[32,18],[10,22]].map(([x,y], i) => (
          <circle key={i} cx={x} cy={y} r="1.5" fill="white" />
        ))}
        <polyline points="0,0 18,-20 38,-8 32,18 10,22 0,0" fill="none" stroke="white" strokeWidth="0.5" strokeDasharray="2,3" />
      </g>
      {[[140,-100,10],[-130,-130,8],[100,200,7],[-200,120,6],[220,-40,9],[-100,200,7]].map(([x,y,sz],i) => (
        <g key={i} transform={`translate(${x},${y})`}>
          <line x1={-sz} y1="0" x2={sz} y2="0" stroke="white" strokeWidth="0.8" />
          <line x1="0" y1={-sz} x2="0" y2={sz} stroke="white" strokeWidth="0.8" />
        </g>
      ))}
      <g transform="translate(0, 190)">
        <circle r="12" fill="none" stroke={isWaxing ? '#FFD700' : 'rgba(255,200,50,0.5)'} strokeWidth="1.5" />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * 45 - 90) * Math.PI / 180;
          return (<line key={i} x1={Math.cos(a)*16} y1={Math.sin(a)*16} x2={Math.cos(a)*22} y2={Math.sin(a)*22}
            stroke={isWaxing ? '#FFD700' : 'rgba(255,200,50,0.5)'} strokeWidth="1.5" strokeLinecap="round" />);
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
      <circle r={clockR} fill="white" />
      <circle r={clockR} fill="none" stroke="#ccc" strokeWidth="2" />
      {Array.from({ length: 60 }, (_, i) => {
        const angle = (i * 6 - 90) * Math.PI / 180;
        const isHour = i % 5 === 0;
        return (
          <line key={i}
            x1={Math.cos(angle) * (isHour ? clockR - 16 : clockR - 10)}
            y1={Math.sin(angle) * (isHour ? clockR - 16 : clockR - 10)}
            x2={Math.cos(angle) * (clockR - 5)}
            y2={Math.sin(angle) * (clockR - 5)}
            stroke={isHour ? '#333' : '#aaa'}
            strokeWidth={isHour ? 2 : 0.5}
          />
        );
      })}
      {hours.map((hour, i) => {
        const angle = (i * 30 - 90) * Math.PI / 180;
        return (
          <text key={i} x={Math.cos(angle) * numberR} y={Math.sin(angle) * numberR}
            className="clock-hour" style={{ fontSize: '13px' }}>{hour}</text>
        );
      })}
      <g transform={`rotate(${clockAngle})`} style={{ transition: 'transform 0.4s ease' }}>
        <line x1="0" y1="8" x2="0" y2={-(clockR - 25)} stroke="#2a5298" strokeWidth="2.5" strokeLinecap="round" />
        <polygon points={`0,${-(clockR-20)} -5,${-(clockR-32)} 5,${-(clockR-32)}`} fill="#2a5298" />
      </g>
      <circle r="5" fill="#333" />
      <circle r="3" fill="#555" />
    </g>
  );
}

// ============================================
// Monthly Calendar Component
// ============================================

function MonthlyCalendar({ selectedDate, onSelectDate }) {
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());

  // Sync view when selectedDate changes month
  useEffect(() => {
    setViewYear(selectedDate.getFullYear());
    setViewMonth(selectedDate.getMonth());
  }, [selectedDate]);

  const todayDate = useMemo(() => new Date(), []);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();

  const calendarDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < firstDow; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewYear, viewMonth, d);
      const lunar = getLunarDayForDate(date);
      const illum = getIllumination(lunar.phase, lunar.day);
      days.push({
        date: d, ...lunar, illumination: illum,
        isSelected: isSameDay(date, selectedDate),
        isToday: isSameDay(date, todayDate),
        wanPhra: isWanPhra(lunar.day),
      });
    }
    return days;
  }, [viewYear, viewMonth, selectedDate, daysInMonth, firstDow, todayDate]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const monthLabel = `${THAI_MONTHS[viewMonth]} ${viewYear + 543}`;

  return (
    <div className="calendar">
      <div className="calendar-nav">
        <button className="cal-nav-btn" onClick={prevMonth}>&lsaquo;</button>
        <span className="cal-month-label">{monthLabel}</span>
        <button className="cal-nav-btn" onClick={nextMonth}>&rsaquo;</button>
      </div>
      <div className="calendar-grid">
        {THAI_DAYS.map(d => (
          <div key={d} className="calendar-header">{d}</div>
        ))}
        {calendarDays.map((day, i) => (
          day ? (
            <div
              key={i}
              className={`calendar-day${day.isSelected ? ' selected' : ''}${day.isToday ? ' today' : ''}${day.wanPhra ? ' wan-phra' : ''}`}
              onClick={() => onSelectDate(new Date(viewYear, viewMonth, day.date))}
              title={`${day.phase === 'waxing' ? 'ขึ้น' : 'แรม'} ${day.day} ค่ำ${day.wanPhra ? ' (วันพระ)' : ''}`}
            >
              <MiniMoon illumination={day.illumination} isWaxing={day.phase === 'waxing'} size={18} />
              <span className="cal-date-num">{day.date}</span>
              {day.wanPhra && <span className="cal-wan-phra-dot" />}
            </div>
          ) : <div key={i} className="calendar-day empty" />
        ))}
      </div>
      <div className="calendar-legend">
        <span className="legend-item"><span className="legend-dot wan-phra-dot" />วันพระ</span>
        <span className="legend-item"><span className="legend-dot today-dot" />วันนี้</span>
      </div>
    </div>
  );
}

// ============================================
// Main App Component
// ============================================

export default function App() {
  const realToday = useMemo(() => new Date(), []);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isAnimating, setIsAnimating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragRotation, setDragRotation] = useState(null);
  const animRef = useRef(null);
  const dragRef = useRef(null);
  const svgRef = useRef(null);

  // Derived lunar data from selectedDate
  const { phase, day: selectedDay } = getLunarDayForDate(selectedDate);
  const moonrise = getMoonriseTime(phase, selectedDay);
  const clockAngle = moonriseToClockAngle(moonrise.hours, moonrise.minutes, phase);
  const phaseName = getPhaseName(phase, selectedDay);
  const wanPhra = isWanPhra(selectedDay);
  const isToday = isSameDay(selectedDate, realToday);
  const discRotation = dragRotation !== null ? dragRotation : -(selectedDay - 1) * DEG_PER_DAY;

  // Stars
  const stars = useMemo(() => {
    const rand = seededRandom(42);
    return Array.from({ length: 150 }, () => {
      const a = rand() * Math.PI * 2;
      const d = 140 + rand() * 230;
      return { x: Math.cos(a)*d, y: Math.sin(a)*d, r: 0.3+rand()*1.5, opacity: 0.15+rand()*0.5, twinkle: rand()>0.75, delay: rand()*3 };
    });
  }, []);

  // Navigate by days
  const goByDays = useCallback((offset) => {
    setSelectedDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + offset);
      return d;
    });
  }, []);

  // Select a specific lunar day within current phase
  const selectLunarDay = useCallback((targetDay) => {
    const diff = targetDay - selectedDay;
    goByDays(diff);
  }, [selectedDay, goByDays]);

  // Switch phase (jump ~15 days)
  const switchPhase = useCallback((targetPhase) => {
    if (targetPhase === phase) return;
    // Jump forward to find day 1 of target phase
    const jumpDays = DAYS_PER_PHASE - selectedDay + 1;
    goByDays(jumpDays);
  }, [phase, selectedDay, goByDays]);

  // Go to today
  const goToToday = useCallback(() => setSelectedDate(new Date()), []);

  // Set date from picker
  const handleDateInput = useCallback((e) => {
    const val = e.target.value;
    if (val) setSelectedDate(new Date(val + 'T12:00:00'));
  }, []);

  // Set date from calendar
  const handleCalendarSelect = useCallback((date) => {
    setSelectedDate(date);
  }, []);

  // Animation
  const toggleAnimation = useCallback(() => {
    if (isAnimating) {
      clearInterval(animRef.current);
      animRef.current = null;
      setIsAnimating(false);
    } else {
      setIsAnimating(true);
      animRef.current = setInterval(() => {
        setSelectedDate(prev => {
          const d = new Date(prev);
          d.setDate(d.getDate() + 1);
          return d;
        });
      }, 500);
    }
  }, [isAnimating]);

  useEffect(() => {
    return () => { if (animRef.current) clearInterval(animRef.current); };
  }, []);

  // Drag handlers
  const handlePointerDown = useCallback((e) => {
    if (isAnimating) return;
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = clientX - cx, dy = clientY - cy;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const svgScale = rect.width / 800;
    if (dist / svgScale < 240 || dist / svgScale > 400) return;

    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    dragRef.current = { startAngle: angle, startRotation: -(selectedDay - 1) * DEG_PER_DAY };
    setDragRotation(-(selectedDay - 1) * DEG_PER_DAY);
    setIsDragging(true);
    if (e.preventDefault) e.preventDefault();
  }, [selectedDay, isAnimating]);

  const handlePointerMove = useCallback((e) => {
    if (!isDragging || !dragRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const angle = Math.atan2(clientY - cy, clientX - cx) * 180 / Math.PI;
    let delta = angle - dragRef.current.startAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    setDragRotation(dragRef.current.startRotation + delta);
    if (e.preventDefault) e.preventDefault();
  }, [isDragging]);

  const handlePointerUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    dragRef.current = null;

    const normalized = ((dragRotation % 360) + 360) % 360;
    const nearestIndex = Math.round(normalized / DEG_PER_DAY) % DAYS_PER_PHASE;
    const dayFromRotation = ((DAYS_PER_PHASE - nearestIndex) % DAYS_PER_PHASE) + 1;
    const targetDay = Math.max(1, Math.min(DAYS_PER_PHASE, dayFromRotation));

    setDragRotation(null);
    if (targetDay !== selectedDay) {
      selectLunarDay(targetDay);
    }
  }, [isDragging, dragRotation, selectedDay, selectLunarDay]);

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

  const moonR = 310;
  const moonSize = 26;

  return (
    <div className="app">
      <div className="title">
        <h1>Lunar Phase Disc</h1>
        <h2>นาฬิกาข้างขึ้น-ข้างแรม</h2>
      </div>

      {/* Controls Row */}
      <div className="controls-row">
        <input
          type="date"
          className="date-input"
          value={toInputDate(selectedDate)}
          onChange={handleDateInput}
        />
        <button className="ctrl-btn" onClick={goToToday} title="Go to today">
          วันนี้
        </button>
        <button className={`ctrl-btn anim-btn ${isAnimating ? 'active' : ''}`} onClick={toggleAnimation} title={isAnimating ? 'Pause' : 'Play animation'}>
          {isAnimating ? (
            <svg width="16" height="16" viewBox="0 0 16 16"><rect x="3" y="2" width="4" height="12" fill="currentColor"/><rect x="9" y="2" width="4" height="12" fill="currentColor"/></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16"><polygon points="3,1 14,8 3,15" fill="currentColor"/></svg>
          )}
        </button>
        <button className="ctrl-btn" onClick={() => goByDays(-1)} title="Previous day">&lsaquo;</button>
        <button className="ctrl-btn" onClick={() => goByDays(1)} title="Next day">&rsaquo;</button>
      </div>

      {/* Date display */}
      <div className="date-display">
        {formatDateThai(selectedDate)}
      </div>

      {/* Disc */}
      <div
        className="disc-container"
        onMouseDown={handlePointerDown}
        onTouchStart={handlePointerDown}
      >
        <svg ref={svgRef} viewBox="-400 -400 800 800" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="spaceGrad" cx="50%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#0f1b3d" />
              <stop offset="100%" stopColor="#060a1a" />
            </radialGradient>
            <radialGradient id="moonGrad" cx="40%" cy="35%">
              <stop offset="0%" stopColor="#f0f0f0" />
              <stop offset="50%" stopColor="#d8d8d8" />
              <stop offset="100%" stopColor="#b8b8b8" />
            </radialGradient>
            <radialGradient id="moonTexture" cx="30%" cy="30%">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="40%" stopColor="rgba(0,0,0,0.05)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.15)" />
            </radialGradient>
            <filter id="moonGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
              <feFlood floodColor="#4a9eff" floodOpacity="0.5" />
              <feComposite in2="blur" operator="in" result="glow" />
              <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="wanPhraGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
              <feFlood floodColor="#FFD700" floodOpacity="0.5" />
              <feComposite in2="blur" operator="in" result="glow" />
              <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <path id="phaseTextPath" d="M -220,0 A 220,220 0 0,1 220,0" transform="rotate(145)" fill="none" />
          </defs>

          <circle r="385" fill="url(#spaceGrad)" />
          <circle r="385" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
          <Stars stars={stars} />
          <SpaceDecorations phase={phase} />
          <circle r="250" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          <circle r="145" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

          <text fill="rgba(255,255,255,0.25)" fontSize="18" fontWeight="300" fontFamily="Kanit, sans-serif">
            <textPath href="#phaseTextPath" startOffset="50%" textAnchor="middle">
              {phase === 'waxing' ? 'ข้างขึ้น waxing moon' : 'ข้างแรม waning moon'}
            </textPath>
          </text>

          {/* Window highlight */}
          <rect
            x={-moonSize - 12} y={-moonR - moonSize - 12}
            width={(moonSize + 12) * 2} height={(moonSize + 12) * 2}
            rx="12" fill="none"
            stroke={wanPhra ? 'rgba(255,215,0,0.5)' : 'rgba(74,158,255,0.3)'}
            strokeWidth="2" strokeDasharray="4,4"
          />
          <polygon
            points={`0,${-moonR + moonSize + 16} -8,${-moonR + moonSize + 26} 8,${-moonR + moonSize + 26}`}
            fill={wanPhra ? 'rgba(255,215,0,0.4)' : 'rgba(74,158,255,0.3)'}
          />

          {/* Moon ring */}
          <g
            className={`moon-ring ${isDragging ? 'dragging' : ''} ${isAnimating ? 'animating' : ''}`}
            style={{ transform: `rotate(${discRotation}deg)` }}
          >
            {Array.from({ length: DAYS_PER_PHASE }, (_, i) => {
              const dayNum = i + 1;
              const angle = i * DEG_PER_DAY - 90;
              const rad = angle * Math.PI / 180;
              const x = Math.cos(rad) * moonR;
              const y = Math.sin(rad) * moonR;
              const isSelected = dayNum === selectedDay;
              const illum = getIllumination(phase, dayNum);
              const isWaxing = phase === 'waxing';
              const dayIsWanPhra = isWanPhra(dayNum);

              const numR = moonR + moonSize + 14;
              const nx = Math.cos(rad) * numR;
              const ny = Math.sin(rad) * numR;

              const counterRot = dragRotation !== null ? -dragRotation : (selectedDay - 1) * DEG_PER_DAY;

              return (
                <g key={i}>
                  {/* วันพระ golden ring */}
                  {dayIsWanPhra && (
                    <circle
                      cx={x} cy={y} r={moonSize + 4}
                      fill="none" stroke="#FFD700"
                      strokeWidth="1.5" opacity={isSelected ? 0.9 : 0.4}
                      transform={`rotate(${counterRot}, ${x}, ${y})`}
                    />
                  )}
                  <g
                    className="moon-group"
                    transform={`translate(${x}, ${y}) rotate(${counterRot})`}
                    onClick={(e) => { e.stopPropagation(); selectLunarDay(dayNum); }}
                    opacity={isSelected ? 1 : 0.55}
                    filter={isSelected ? (dayIsWanPhra ? 'url(#wanPhraGlow)' : 'url(#moonGlow)') : 'none'}
                  >
                    <g transform={`scale(${isSelected ? 1.2 : 1})`}>
                      <MoonPhase illumination={illum} isWaxing={isWaxing} r={moonSize} />
                    </g>
                  </g>
                  <text
                    x={nx} y={ny}
                    className={`day-number ${isSelected ? 'selected' : ''} ${dayIsWanPhra ? 'wan-phra-day' : ''}`}
                    transform={`rotate(${counterRot}, ${nx}, ${ny})`}
                    onClick={(e) => { e.stopPropagation(); selectLunarDay(dayNum); }}
                    style={{ cursor: 'pointer' }}
                  >
                    {dayNum}
                  </text>
                </g>
              );
            })}
          </g>

          <ClockFace phase={phase} clockAngle={clockAngle} />
        </svg>
      </div>

      {/* Info Panel */}
      <div className={`info-panel ${wanPhra ? 'wan-phra-panel' : ''}`}>
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
        {wanPhra && (
          <div className="wan-phra-badge">
            วันพระ &middot; {getWanPhraLabel(phase, selectedDay)}
          </div>
        )}
        {isToday && <div className="today-badge">TODAY</div>}
      </div>

      {/* Phase Toggle */}
      <div className="toggle-container">
        <button className={`toggle-btn ${phase === 'waxing' ? 'active' : ''}`} onClick={() => switchPhase('waxing')}>
          ข้างขึ้น Waxing
        </button>
        <button className={`toggle-btn ${phase === 'waning' ? 'active' : ''}`} onClick={() => switchPhase('waning')}>
          ข้างแรม Waning
        </button>
      </div>

      {/* Day selector */}
      <div className="day-selector">
        {Array.from({ length: DAYS_PER_PHASE }, (_, i) => {
          const d = i + 1;
          return (
            <button
              key={i}
              className={`day-btn ${selectedDay === d ? 'active' : ''} ${isWanPhra(d) ? 'wan-phra' : ''}`}
              onClick={() => selectLunarDay(d)}
            >
              {d}
            </button>
          );
        })}
      </div>

      {/* Monthly Calendar */}
      <MonthlyCalendar selectedDate={selectedDate} onSelectDate={handleCalendarSelect} />
    </div>
  );
}
