export const AudioService = (() => {
  let audioPlayerPromise: Promise<HTMLAudioElement> | null = null;

  /**
   * Sets up the audio player by creating or reusing a persistent `<audio>` element for notification sounds.
   *
   * Ensures that the audio player is initialized only once and is ready for playback after the DOM is loaded. If the `document` object is unavailable, initialization fails.
   */
  function initialize() {
    if (audioPlayerPromise) {return;}

    audioPlayerPromise = new Promise((resolve, reject) => {
      if (typeof document === 'undefined') {
        return reject(new Error('AudioService: Cannot initialize, document is not available.'));
      }

      const createPlayer = () => {
        const existingPlayer = document.getElementById('notification-sound-player');
        if (existingPlayer) {
          return resolve(existingPlayer as HTMLAudioElement);
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
   * Plays a notification sound if the audio player is available.
   *
   * In Manifest V2 environments, resets and plays the notification audio element. In Manifest V3 environments, playback is not implemented and the function returns without playing sound.
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
      if (audioPlayer) {
        audioPlayer.currentTime = 0;
        await audioPlayer.play();
      }
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
