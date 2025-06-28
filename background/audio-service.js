const AudioService = (() => {
  let audioPlayerPromise = null;

  /**
   * Initializes the audio player by creating a Promise that resolves with the <audio> element
   * once the DOM is ready. This ensures that any call to playSound() will wait for
   * initialization to complete.
   */
  function initialize() {
    if (audioPlayerPromise) return;

    audioPlayerPromise = new Promise((resolve, reject) => {
      if (typeof document === 'undefined') {
        return reject(new Error('AudioService: Cannot initialize, document is not available.'));
      }

      const createPlayer = () => {
        const existingPlayer = document.getElementById('notification-sound-player');
        if (existingPlayer) {
          return resolve(existingPlayer);
        }

        const player = document.createElement('audio');
        player.id = 'notification-sound-player';
        player.src = browser.runtime.getURL('audio/notification.mp3');
        player.preload = 'auto';
        document.body.appendChild(player);
        console.info(
          'AudioService: MV2 environment detected. Initialized persistent <audio> element.'
        );
        resolve(player);
      };

      if (document.body) {
        createPlayer();
      } else {
        document.addEventListener('DOMContentLoaded', createPlayer);
      }
    });

    audioPlayerPromise.catch((error) =>
      console.error('AudioService initialization failed:', error)
    );
  }

  /**
   * Plays the notification sound.
   */
  async function playSound() {
    // MV3 implementation (for the future)
    if (chrome.offscreen) {
      console.warn('AudioService: MV3 playSound() not yet implemented.');
      return;
    }

    // MV2 implementation
    try {
      const audioPlayer = await audioPlayerPromise;
      audioPlayer.currentTime = 0;
      await audioPlayer.play();
    } catch (error) {
      console.warn('AudioService: Error playing notification sound:', error);
    }
  }

  // Initialize on script load
  initialize();

  // Public API
  return {
    playSound,
  };
})();
