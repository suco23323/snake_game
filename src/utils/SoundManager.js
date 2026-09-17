// Sound effects manager
class SoundManager {
  constructor() {
    this.sounds = {};
    this.enabled = true;
    this.audioContext = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      
      this.audioContext = new AudioContext();
      this.initialized = true;
    } catch (e) {
      console.warn('AudioContext not supported or failed to initialize', e);
    }
  }

  createTone(frequency, duration, type = 'sine') {
    if (!this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
    oscillator.type = type;
    
    gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
    
    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + duration);
  }

  ensureContext() {
    if (!this.initialized) {
      this.init();
    }
    // If context is suspended (usually due to no user interaction), try to resume
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
  }

  play(soundName) {
    if (!this.enabled) return;
    
    this.ensureContext();
    if (!this.audioContext) return;

    try {
      switch (soundName) {
        case 'eat':
          this.createTone(800, 0.1, 'sine');
          break;
        case 'gameOver':
          this.createTone(200, 0.5, 'sawtooth');
          break;
        case 'goldenFood':
          this.createTone(1200, 0.2, 'sine');
          break;
        case 'speedBoost':
          this.createTone(600, 0.15, 'square');
          break;
        case 'ghostMode':
          this.createTone(400, 0.3, 'triangle');
          break;
      }
    } catch (e) {
      console.warn('Error playing sound:', e);
    }
  }

  toggleSound() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}

export default new SoundManager();