// Audio Manager - handles all game music and sound effects

// Music tracks (paths relative to index.html)
const menuMusic = new Audio('./src/assets/music/menu.mp3');
const builderMusic1 = new Audio('./src/assets/music/builder1.mp3');
const builderMusic2 = new Audio('./src/assets/music/builder2.mp3');

// Sound effects
const sfxWhoosh = new Audio('./src/assets/sfx/whoosh.mp3');
const sfxDelete = new Audio('./src/assets/sfx/delete.mp3');
const sfxThump = new Audio('./src/assets/sfx/thump.mp3');

// Configure volumes
menuMusic.volume = 0.5;
builderMusic1.volume = 0.4;
builderMusic2.volume = 0.4;
sfxWhoosh.volume = 0.6;
sfxDelete.volume = 0.5;
sfxThump.volume = 0.5;

// Track current state
let currentMusic = null;
let builderTrackIndex = 0;
let menuLoopTimeout = null;
let isMuted = false;

// Mute/unmute all audio
function setMuted(muted) {
    isMuted = muted;
    menuMusic.muted = muted;
    builderMusic1.muted = muted;
    builderMusic2.muted = muted;
    sfxWhoosh.muted = muted;
    sfxDelete.muted = muted;
    sfxThump.muted = muted;
}

function toggleMute() {
    setMuted(!isMuted);
    return isMuted;
}

function getMuted() {
    return isMuted;
}

// Menu music with 1 second gap between loops
function playMenuMusic() {
    stopAllMusic();
    currentMusic = 'menu';

    const playWithGap = () => {
        if (currentMusic !== 'menu') return;

        menuMusic.currentTime = 0;
        menuMusic.play().catch(() => {});

        menuMusic.onended = () => {
            if (currentMusic === 'menu') {
                // 1 second gap before next loop
                menuLoopTimeout = setTimeout(playWithGap, 1000);
            }
        };
    };

    playWithGap();
}

// Builder music - alternates between builder1 and builder2
function playBuilderMusic() {
    stopAllMusic();
    currentMusic = 'builder';
    builderTrackIndex = 0;

    const playNextTrack = () => {
        if (currentMusic !== 'builder') return;

        const track = builderTrackIndex === 0 ? builderMusic1 : builderMusic2;
        track.currentTime = 0;
        track.play().catch(() => {});

        track.onended = () => {
            if (currentMusic === 'builder') {
                builderTrackIndex = (builderTrackIndex + 1) % 2;
                playNextTrack();
            }
        };
    };

    playNextTrack();
}

// Stop all music
function stopAllMusic() {
    currentMusic = null;

    if (menuLoopTimeout) {
        clearTimeout(menuLoopTimeout);
        menuLoopTimeout = null;
    }

    menuMusic.pause();
    menuMusic.currentTime = 0;
    menuMusic.onended = null;

    builderMusic1.pause();
    builderMusic1.currentTime = 0;
    builderMusic1.onended = null;

    builderMusic2.pause();
    builderMusic2.currentTime = 0;
    builderMusic2.onended = null;
}

// Play sound effects
function playWhoosh() {
    sfxWhoosh.currentTime = 0;
    sfxWhoosh.play().catch(() => {});
}

function playDelete() {
    sfxDelete.currentTime = 0;
    sfxDelete.play().catch(() => {});
}

function playThump() {
    sfxThump.currentTime = 0;
    sfxThump.play().catch(() => {});
}

export {
    playMenuMusic,
    playBuilderMusic,
    stopAllMusic,
    playWhoosh,
    playDelete,
    playThump,
    toggleMute,
    getMuted
};
