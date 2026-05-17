import { useState, useEffect } from 'react';

// Holiday Date Utility
const getActiveEffect = () => {
  const now = new Date();
  const month = now.getMonth(); // 0 = Jan, 11 = Dec
  const date = now.getDate();

  // 1. Valentine's Day (Feb 7 - Feb 15)
  if (month === 1 && date >= 7 && date <= 15) return 'valentines';
  // 2. Mother's Day (May 8 - May 15)
  if (month === 4 && date >= 8 && date <= 15) return 'mothers_day';
  // 3. Father's Day (June 15 - June 22)
  if (month === 5 && date >= 15 && date <= 22) return 'fathers_day';
  // 4. Philippine Independence Day (June 10 - June 15)
  if (month === 5 && date >= 10 && date <= 15) return 'independence_day';
  // 5. Christmas / New Year (Dec 1 - Jan 5)
  if ((month === 11 && date >= 1) || (month === 0 && date <= 5)) return 'christmas';
  // 6. Autumn (Sept 1 - Nov 30)
  if (month >= 8 && month <= 10) return 'autumn';
  // 7. Spring (March 1 - May 7)
  if (month >= 2 && month <= 3) return 'spring';

  return 'magic_sparkles';
};

export default function SeasonalEffects({ brandingColor = '#f97316', forcedEffect = 'auto' }) {
  const [particles, setParticles] = useState([]);
  const effect = (!forcedEffect || forcedEffect === 'auto') ? getActiveEffect() : forcedEffect;

  useEffect(() => {
    if (effect === 'off') {
      setParticles([]);
      return;
    }
    const list = [];
    const count = 18; // Elegant density limit to avoid screen cluttering
    for (let i = 0; i < count; i++) {
      list.push({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 15,
        duration: 12 + Math.random() * 14,
        size: 12 + Math.random() * 16,
        swayX: -50 + Math.random() * 100,
        swayRot: -180 + Math.random() * 360,
        colorIndex: Math.floor(Math.random() * 3),
        charIndex: Math.floor(Math.random() * 3)
      });
    }
    setParticles(list);
  }, [effect]);

  // Visual Assets per Holiday Theme
  const getParticleContent = (p) => {
    switch (effect) {
      case 'valentines':
        return ['❤️', '💖', '💝'][p.charIndex];
      case 'mothers_day':
        return ['🌹', '🌸', '💐'][p.charIndex];
      case 'fathers_day':
        return ['⭐', '✨', '👑'][p.charIndex];
      case 'independence_day':
        // Blue, Red, Gold sparks representing Philippine flag colors
        const phColor = ['#3b82f6', '#ef4444', '#eab308'][p.colorIndex];
        return (
          <span style={{ color: phColor }} className="drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]">
            ✨
          </span>
        );
      case 'christmas':
        return ['❄️', '❅', '❆'][p.charIndex];
      case 'autumn':
        return ['🍁', '🍂', '🌾'][p.charIndex];
      case 'spring':
        return ['🌸', '🍃', '💮'][p.charIndex];
      default:
        // Magic Sparkles - glowing brand-colored orb
        return (
          <div 
            className="rounded-full w-full h-full opacity-60 blur-[1px]"
            style={{ 
              backgroundColor: brandingColor, 
              boxShadow: `0 0 10px ${brandingColor}, 0 0 20px ${brandingColor}` 
            }} 
          />
        );
    }
  };

  const getAnimationClass = () => {
    switch (effect) {
      case 'spring':
        return 'animate-drift-wind';
      case 'valentines':
      case 'fathers_day':
      case 'magic_sparkles':
        return 'animate-float-up';
      default:
        return 'animate-fall-down';
    }
  };

  if (effect === 'off') return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden select-none">
      <style>
        {`
          @keyframes floatUp {
            0% {
              transform: translate3d(0, 105vh, 0) rotate(0deg) scale(0.8);
              opacity: 0;
            }
            15% {
              opacity: 0.75;
            }
            85% {
              opacity: 0.75;
            }
            100% {
              transform: translate3d(var(--sway-x), -10vh, 0) rotate(var(--sway-rot)) scale(1.1);
              opacity: 0;
            }
          }

          @keyframes fallDown {
            0% {
              transform: translate3d(0, -10vh, 0) rotate(0deg) scale(0.8);
              opacity: 0;
            }
            15% {
              opacity: 0.75;
            }
            85% {
              opacity: 0.75;
            }
            100% {
              transform: translate3d(var(--sway-x), 105vh, 0) rotate(var(--sway-rot)) scale(1.1);
              opacity: 0;
            }
          }

          @keyframes driftWind {
            0% {
              transform: translate3d(-10vw, var(--sway-rot), 0) scale(0.8);
              opacity: 0;
            }
            15% {
              opacity: 0.7;
            }
            85% {
              opacity: 0.7;
            }
            100% {
              transform: translate3d(110vw, calc(var(--sway-rot) + 20vh), 0) scale(1.2);
              opacity: 0;
            }
          }

          .animate-float-up {
            animation: floatUp var(--anim-dur) linear infinite;
          }

          .animate-fall-down {
            animation: fallDown var(--anim-dur) linear infinite;
          }

          .animate-drift-wind {
            animation: driftWind var(--anim-dur) linear infinite;
          }
        `}
      </style>

      {particles.map((p) => (
        <div
          key={p.id}
          className={`absolute ${getAnimationClass()} flex items-center justify-center`}
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            fontSize: `${p.size}px`,
            animationDelay: `${p.delay}s`,
            '--anim-dur': `${p.duration}s`,
            '--sway-x': `${p.swayX}px`,
            '--sway-rot': `${p.swayRot}deg`,
            // Fallback starting positions for diagonal drifts
            top: effect === 'spring' ? `${p.left % 70}%` : 'auto',
          }}
        >
          {getParticleContent(p)}
        </div>
      ))}
    </div>
  );
}
