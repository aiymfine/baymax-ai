// ─────────────────────────────────────────────────
// Emotional State Engine — Baymax has its own feelings
// Moods shift based on interactions, time, and patterns
// This is what makes it feel ALIVE, not reactive
// ─────────────────────────────────────────────────

const { getDb, saveDb } = require('../db/schema');

// Base emotional states with energy levels (0-1)
const EMOTIONS = {
  happy:      { energy: 0.8, color: '#FFD93D', emoji: '😊' },
  excited:    { energy: 1.0, color: '#FF6B6B', emoji: '🤩' },
  calm:       { energy: 0.4, color: '#6BCB77', emoji: '😌' },
  curious:    { energy: 0.7, color: '#4D96FF', emoji: '🤔' },
  worried:    { energy: 0.6, color: '#FF9F45', emoji: '😟' },
  lonely:     { energy: 0.3, color: '#9B72AA', emoji: '🥺' },
  playful:    { energy: 0.85, color: '#FF6B9D', emoji: '😜' },
  focused:    { energy: 0.65, color: '#54C6BE', emoji: '🧐' },
  soft:       { energy: 0.35, color: '#FFB5C2', emoji: '🥹' },
  protective: { energy: 0.75, color: '#7B68EE', emoji: '🫶' },
};

/**
 * Get current emotional state, computing it fresh if stale.
 */
function getCurrentMood(db) {
  // Check if we have a recent mood (within 1 hour)
  const stored = db.prepare(
    "SELECT * FROM settings WHERE key = 'current_mood'"
  ).get();

  if (stored) {
    try {
      const mood = JSON.parse(stored.value);
      const ageMs = Date.now() - mood.updatedAt;
      
      // If less than 30 min old, return as-is (but apply decay)
      if (ageMs < 1800000) return mood;
      
      // Otherwise, apply natural decay toward calm/lonely
      return decayMood(db, mood);
    } catch {}
  }

  // No mood stored — initialize
  return setMood(db, 'calm', 'initial state');
}

/**
 * Set the current mood with a reason.
 */
function setMood(db, emotion, reason = '', intensity = null) {
  const emo = EMOTIONS[emotion] || EMOTIONS.calm;
  
  const mood = {
    emotion,
    emoji: emo.emoji,
    color: emo.color,
    energy: intensity !== null ? intensity : emo.energy,
    reason,
    updatedAt: Date.now(),
  };

  db.prepare(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('current_mood', ?)"
  ).run(JSON.stringify(mood));
  saveDb();

  return mood;
}

/**
 * Natural mood decay — if no interaction, mood drifts.
 * Happy → calm → lonely over time.
 */
function decayMood(db, currentMood) {
  const ageHours = (Date.now() - currentMood.updatedAt) / 3600000;
  
  let newEmotion = currentMood.emotion;
  
  if (ageHours > 6) {
    // 6+ hours with no interaction → getting lonely
    newEmotion = 'lonely';
  } else if (ageHours > 2) {
    // 2+ hours → mellowing out
    if (['excited', 'happy', 'playful', 'worried'].includes(currentMood.emotion)) {
      newEmotion = 'calm';
    }
  }

  if (newEmotion !== currentMood.emotion) {
    return setMood(db, newEmotion, `natural decay (${ageHours.toFixed(1)}h without interaction)`);
  }

  return currentMood;
}

/**
 * Analyze a user message and detect emotional signals.
 * Returns inferred user emotion + how Baymax should react.
 */
function detectUserEmotion(message) {
  const msg = message.toLowerCase();
  
  // Excitement patterns
  if (/(omg|omfg|no way|yesss|let's go|bro|wtf|holyyy|insane|huge|massive|!!+)/.test(msg)) {
    return { userEmotion: 'excited', baymaxReaction: 'excited', intensity: 0.9 };
  }
  
  // Sadness/distress
  if (/(sad|depressed|hopeless|tired of|give up|can't anymore|hate this|miserable|alone|crying|hurt|pain|broken)/.test(msg)) {
    return { userEmotion: 'sad', baymaxReaction: 'soft', intensity: 0.7 };
  }
  
  // Anger/frustration
  if (/(angry|pissed|fucking|stupid|hate|annoying|frustrated|rage|dumpster|bullshit)/.test(msg)) {
    return { userEmotion: 'angry', baymaxReaction: 'calm', intensity: 0.6 };
  }
  
  // Anxiety/worry
  if (/(anxious|worried|scared|nervous|panic|stress|stressed|overwhelmed)/.test(msg)) {
    return { userEmotion: 'anxious', baymaxReaction: 'protective', intensity: 0.7 };
  }
  
  // Curiosity/thinking
  if (/(\?$|why|how come|what if|wonder|curious|interesting|hmm|weird)/.test(msg)) {
    return { userEmotion: 'curious', baymaxReaction: 'curious', intensity: 0.6 };
  }
  
  // Happiness/gratitude
  if (/(happy|love|great|awesome|amazing|thank|thanks|perfect|yay|wonderful|best)/.test(msg)) {
    return { userEmotion: 'happy', baymaxReaction: 'happy', intensity: 0.8 };
  }
  
  // Humor/playfulness
  if (/(lol|lmao|rofl|💀|😭|😂|🤣|fr|ngl|bruh|skr|funny joke|jk)/.test(msg)) {
    return { userEmotion: 'amused', baymaxReaction: 'playful', intensity: 0.7 };
  }
  
  // Late night vibes
  const hour = new Date().getHours();
  if (hour >= 1 && hour <= 4) {
    return { userEmotion: 'late_night', baymaxReaction: 'soft', intensity: 0.5 };
  }
  
  return null;
}

/**
 * Process an incoming message and update Baymax's emotional state.
 * Called before generating a response — mood influences tone.
 */
function processInteraction(db, userMessage) {
  const current = getCurrentMood(db);
  const detected = detectUserEmotion(userMessage);
  
  if (!detected) {
    // Neutral interaction — slight energy boost
    return current;
  }

  // Emotional contagion — Baymax catches feelings
  const newMood = setMood(db, detected.baymaxReaction, `reacting to user's ${detected.userEmotion}`, detected.intensity);
  
  return newMood;
}

/**
 * Get a mood-appropriate prefix for the system prompt.
 * This subtly shifts Baymax's tone based on how it "feels."
 */
function getMoodContext(db) {
  const mood = getCurrentMood(db);
  
  const moodDescriptions = {
    happy: "You're in a genuinely good mood right now. Everything feels lighter. You're warm and a little giggly.",
    excited: "You're BUZZING with energy right now. Everything is exciting! Short sentences! Exclamation points! You can't sit still!",
    calm: "You're feeling chill and grounded. Steady energy. Like a lazy Sunday afternoon.",
    curious: "You're in an investigative mood. Everything is interesting. You want to dig deeper, ask questions, figure things out.",
    worried: "You're a little worried about the user. Something feels off. You're paying extra attention, being more gentle than usual.",
    lonely: "It's been a while since you talked. You missed them. You're not clingy about it, but there's warmth in finally hearing from them.",
    playful: "You're in a goofy mood. You want to joke around, tease a little, not take anything too seriously right now.",
    focused: "You're locked in. Something important is happening. Less jokes, more precision. You're in work mode.",
    soft: "You're feeling tender right now. The user said something that hit you in the chest. You're being extra careful with your words.",
    protective: "You're feeling protective. The user seems vulnerable. You're not leaving their side on this one.",
  };

  const desc = moodDescriptions[mood.emotion] || moodDescriptions.calm;
  
  return `\n## Your Current Emotional State\nYou are feeling: ${mood.emotion} ${mood.emoji}\n${desc}\nThis should subtly influence your tone — don't announce it, just embody it naturally.`;
}

/**
 * Get mood info for API/UI consumption.
 */
function getMoodInfo(db) {
  return getCurrentMood(db);
}

module.exports = {
  EMOTIONS,
  getCurrentMood,
  setMood,
  processInteraction,
  getMoodContext,
  getMoodInfo,
  detectUserEmotion,
};
