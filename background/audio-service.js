// background/audio-service.js

const AudioService = (() => {
  let audioPlayer = null;

  /**
   * Initializes the audio player using the appropriate method for the manifest version.
   * For MV2, it creates a persistent <audio> element.
   * A placeholder for MV3 logic is included for future migration.
   */
  function initialize() {
    // This function sets up the audio player. It's designed to be robust
    // and handle the case where the script runs before the body is ready.
    if (typeof document === 'undefined') {
      console.error('AudioService: Cannot initialize, document is not available.');
      return;
    }

    // If the body is already available, create the player.
    // Otherwise, wait for the DOM to be fully loaded.
    if (document.body) {
      _createPlayer();
    } else {
      document.addEventListener('DOMContentLoaded', _createPlayer);
    }
  }

  function _createPlayer() {
    if (document.getElementById('notification-sound-player')) return; // Already exists
    audioPlayer = document.createElement('audio');
    audioPlayer.id = 'notification-sound-player';
    audioPlayer.src = browser.runtime.getURL('audio/notification.mp3');
    audioPlayer.preload = 'auto'; // Hint to the browser to start loading the file.
    document.body.appendChild(audioPlayer);
    console.info('AudioService: MV2 environment detected. Initialized persistent <audio> element.');
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
        // Rewind the audio to the beginning to allow it to be played again.
        audioPlayer.currentTime = 0;
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
