// Persistent audio context - created only after first user gesture
let _audioCtx = null;
let _audioUnlocked = false;

function getAudioCtx() {
  // We avoid creating the context here if we can, to prevent premature initialization errors
  return _audioCtx;
}

// Call this on ANY user gesture (click/tap) to unlock audio for the session
export function unlockAudio() {
  if (_audioUnlocked) return;
  try {
    // Create context ONLY during this user gesture
    if (!_audioCtx) {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (_audioCtx.state === 'suspended') {
      _audioCtx.resume().catch(err => console.warn('Audio resume failed:', err));
    }

    // Play a silent buffer to fully unlock
    const buf = _audioCtx.createBuffer(1, 1, 22050);
    const src = _audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(_audioCtx.destination);
    src.start(0);

    // Also unlock speech synthesis with a silent utterance
    if ('speechSynthesis' in window) {
      const silent = new SpeechSynthesisUtterance('');
      silent.volume = 0;
      window.speechSynthesis.speak(silent);
    }
    
    _audioUnlocked = true;
    console.log('Audio Context successfully initialized and unlocked.');
  } catch (e) {
    console.error('Audio unlock failed:', e);
  }
}

export function playNotificationSound(type = 'default') {
  try {
    const ctx = getAudioCtx();
    if (!ctx || ctx.state === 'suspended') {
      // If context doesn't exist or is suspended, we can't play sound yet.
      // This is expected if the user hasn't interacted with the page yet.
      return;
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'newOrder') {
      // Double beep for staff attention
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(); osc.stop(ctx.currentTime + 0.3);
      
      setTimeout(() => {
        const osc2 = getAudioCtx().createOscillator();
        const gain2 = getAudioCtx().createGain();
        osc2.connect(gain2); gain2.connect(getAudioCtx().destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880, getAudioCtx().currentTime);
        osc2.frequency.exponentialRampToValueAtTime(440, getAudioCtx().currentTime + 0.3);
        gain2.gain.setValueAtTime(0, getAudioCtx().currentTime);
        gain2.gain.linearRampToValueAtTime(0.2, getAudioCtx().currentTime + 0.05);
        gain2.gain.exponentialRampToValueAtTime(0.01, getAudioCtx().currentTime + 0.3);
        osc2.start(); osc2.stop(getAudioCtx().currentTime + 0.3);
      }, 400);
    } else if (type === 'ready') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start(); osc.stop(ctx.currentTime + 0.15);
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2); gain2.connect(ctx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(659, ctx.currentTime);
        gain2.gain.setValueAtTime(0.15, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc2.start(); osc2.stop(ctx.currentTime + 0.15);
      }, 180);
      setTimeout(() => {
        const osc3 = ctx.createOscillator();
        const gain3 = ctx.createGain();
        osc3.connect(gain3); gain3.connect(ctx.destination);
        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(784, ctx.currentTime);
        gain3.gain.setValueAtTime(0.15, ctx.currentTime);
        gain3.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc3.start(); osc3.stop(ctx.currentTime + 0.3);
      }, 360);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start(); osc.stop(ctx.currentTime + 0.2);
    }
  } catch (e) { console.warn('Audio failed:', e); }
}

export function formatCurrency(amount) {
  return `₱${parseFloat(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(date) {
  return new Date(date).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatTime(date) {
  return new Date(date).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
}

export function getStatusColor(status) {
  const colors = { pending: 'amber', confirmed: 'blue', preparing: 'orange', ready: 'emerald', completed: 'surface', cancelled: 'red' };
  return colors[status] || 'surface';
}

export function getElapsedMinutes(dateString) {
  if (!dateString) return 0;
  return Math.floor((Date.now() - new Date(dateString).getTime()) / 60000);
}

export function formatMinutes(minutes) {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} mins`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hrs} hr${hrs > 1 ? 's' : ''}${mins > 0 ? ` ${mins} mins` : ''}`;
}

export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? 
    `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : 
    null;
}

/**
 * Generates a basic EMVCo QR string for GCash (QR Ph)
 * @param {string} account - GCash mobile number (e.g. 09123456789)
 * @param {number} amount - Amount to pay
 * @param {string} name - Merchant/Account name
 */

/**
 * Updates the native PWA home screen app badge
 * @param {number} count - Number of updates/notifications
 */
export function updateAppBadge(count) {
  try {
    if ('setAppBadge' in navigator) {
      if (count > 0) {
        navigator.setAppBadge(count).catch(err => console.warn('PWA: Failed to set app badge:', err));
      } else {
        navigator.clearAppBadge().catch(err => console.warn('PWA: Failed to clear app badge:', err));
      }
    }
  } catch (e) {
    console.warn('PWA: App Badge API not supported or failed:', e);
  }
}

/**
 * Requests native system notification permissions
 */
export function requestNotificationPermission() {
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        console.log(`PWA: Notification permission response: ${permission}`);
      });
    }
  } catch (e) {
    console.warn('PWA: Notification permissions API failed:', e);
  }
}

/**
 * Shows a native OS system notification (notification bar / drawer banner)
 * @param {string} title - The title of the notification
 * @param {string} body - The body copy text
 * @param {string} icon - Absolute or relative path to icon image
 */
export function showSystemNotification(title, body, icon = 'https://cdn-icons-png.flaticon.com/512/5787/5787016.png') {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      const options = {
        body,
        icon,
        badge: icon,
        vibrate: [200, 100, 200],
        tag: 'kainlowkal-pos',
        renotify: true
      };

      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then(registration => {
          registration.showNotification(title, options);
        });
      } else {
        new Notification(title, options);
      }
    }
  } catch (e) {
    console.warn('PWA: Failed to display system notification:', e);
  }
}
