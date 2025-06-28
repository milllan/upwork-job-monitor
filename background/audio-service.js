// background/audio-service.js

const AudioService = (() => {
  let audioPlayer = null;

  /**
   * Initializes the audio player using the appropriate method for the manifest version.
   * For MV2, it creates a persistent <audio> element.
   * A placeholder for MV3 logic is included for future migration.
   */
  function initialize() {
    // MV3 check (will be false in your current extension)
    if (chrome.offscreen) {
      // Logic for MV3 would go here. For now, we do nothing.
      console.info('AudioService: MV3 environment detected (Offscreen API available).');
    }
    // MV2 fallback
    else if (typeof document !== 'undefined') {
      audioPlayer = document.createElement('audio');
      audioPlayer.src = browser.runtime.getURL('audio/notification.mp3');
      document.body.appendChild(audioPlayer);
      console.info(
        'AudioService: MV2 environment detected. Initialized persistent <audio> element.'
      );
    } else {
      console.error(
        'AudioService: Could not initialize. Neither Offscreen API nor document is available.'
      );
    }
  }

  /**
   * Plays the notification sound.
   */
  async function playSound() {
    // MV3 implementation (for the future)
    if (chrome.offscreen) {
      // This is where you would call the createDocument logic for MV3
      console.warn('AudioService: MV3 playSound() not yet implemented.');
      return;
    }

    // MV2 implementation (for today)
    if (audioPlayer) {
      try {
        await audioPlayer.play();
      } catch (error) {
        console.warn('AudioService: Error playing notification sound:', error);
      }
    } else {
      console.warn('AudioService: Player not initialized, cannot play sound.');
    }
  }

  // Initialize on script load
  initialize();

  // Public API
  return {
    playSound,
  };
})();
