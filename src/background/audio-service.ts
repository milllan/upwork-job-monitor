
export const AudioService = (() => {
  let audioPlayerPromise: Promise<HTMLAudioElement> | null = null;

  /**
   * Initializes the audio player by creating a Promise that resolves with the <audio> element
   * once the DOM is ready. This ensures that any call to playSound() will wait for
   * initialization to complete.
   */
  function initialize() {
    if (audioPlayerPromise) {return;}

    audioPlayerPromise = new Promise((resolve, reject) => {
      if (typeof document === 'undefined') {
        reject(new Error('AudioService: Cannot initialize, document is not available.')); return;
      }

      const createPlayer = () => {
        const existingPlayer = document.getElementById('notification-sound-player');
        if (existingPlayer) {
          if (existingPlayer instanceof HTMLAudioElement) {
            resolve(existingPlayer); return;
          } else {
            // Element exists but is the wrong type, so remove it and proceed to create a new one.
            existingPlayer.remove();
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- document.body can be null in some offscreen/early-init cases
        if (!document.body) {
          reject(new Error('AudioService: Cannot initialize, document.body is not available.'));
          return;
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

      createPlayer();
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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- chrome.offscreen may be undefined; runtime check is intentional
    if (chrome.offscreen) {
      console.warn('AudioService: MV3 playSound() not yet implemented.');
      return;
    }

    // MV2 implementation
    try {
      const audioPlayer = await audioPlayerPromise;
      // Guard for strict null checks in case initialization was rejected
      if (!audioPlayer) {
        throw new Error('AudioService: audio player not initialized');
      }
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
