const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const config = require('../config');

class WordValidator {
  constructor() {
    this.words = [];
    this.loadWords();
  }

  // Load words from JSON file
  loadWords() {
    try {
      const wordsData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'validWords.json'), 'utf8'));
      this.words = wordsData.words || [];
      logger.info(`Loaded ${this.words.length} valid words from dictionary`);
    } catch (error) {
      logger.error('Error loading word dictionary, using fallback words:', error);
      this.words = [
        'HELLO', 'WORLD', 'GAMES', 'PLAYS', 'SMART', 'BRAIN', 'QUICK', 'FAST', 'SLOW', 'EASY',
        'HAPPY', 'SMILE', 'DANCE', 'MUSIC', 'BOOKS', 'STARS', 'OCEAN', 'MOUNTAIN', 'FOREST', 'RIVER',
        'FRIEND', 'FAMILY', 'SCHOOL', 'WORK', 'HOME', 'FOOD', 'WATER', 'SLEEP', 'DREAM', 'HOPE'
      ];
    }
  }

  // Check if a word is valid
  isValidWord(word) {
    if (!word || typeof word !== 'string') {
      return false;
    }

    const normalizedWord = word.trim().toUpperCase();
    
    // Check length
    if (normalizedWord.length !== config.WORD_LENGTH) {
      return false;
    }

    // Check if it's in our dictionary
    return this.words.includes(normalizedWord);
  }

  // Get word suggestions based on partial input
  getSuggestions(partialWord, maxSuggestions = 5) {
    if (!partialWord || typeof partialWord !== 'string') {
      return [];
    }

    const normalizedPartial = partialWord.trim().toUpperCase();
    
    if (normalizedPartial.length === 0) {
      return [];
    }

    // Find words that start with the partial
    const suggestions = this.words
      .filter(word => word.startsWith(normalizedPartial))
      .slice(0, maxSuggestions);

    // If we don't have enough suggestions, add words that contain the partial
    if (suggestions.length < maxSuggestions) {
      const containingWords = this.words
        .filter(word => 
          word.includes(normalizedPartial) && 
          !suggestions.includes(word)
        )
        .slice(0, maxSuggestions - suggestions.length);
      
      suggestions.push(...containingWords);
    }

    return suggestions;
  }

  // Get random word from dictionary
  getRandomWord() {
    if (this.words.length === 0) {
      logger.warn('No words available, returning fallback');
      return 'HELLO';
    }
    
    return this.words[Math.floor(Math.random() * this.words.length)];
  }

  // Get multiple random words
  getRandomWords(count = 1) {
    if (count <= 0) return [];
    
    const shuffled = [...this.words].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, this.words.length));
  }

  // Validate word format (without checking dictionary)
  isValidWordFormat(word) {
    if (!word || typeof word !== 'string') {
      return false;
    }

    const normalizedWord = word.trim();
    
    // Check length
    if (normalizedWord.length !== config.WORD_LENGTH) {
      return false;
    }

    // Check if it only contains letters
    if (!/^[a-zA-Z]+$/.test(normalizedWord)) {
      return false;
    }

    return true;
  }

  // Get word statistics
  getWordStats() {
    return {
      totalWords: this.words.length,
      averageLength: this.words.length > 0 
        ? this.words.reduce((sum, word) => sum + word.length, 0) / this.words.length 
        : 0,
      shortestWord: this.words.length > 0 
        ? Math.min(...this.words.map(word => word.length))
        : 0,
      longestWord: this.words.length > 0 
        ? Math.max(...this.words.map(word => word.length))
        : 0
    };
  }

  // Check if word is common (for difficulty rating)
  isCommonWord(word) {
    const normalizedWord = word.trim().toUpperCase();
    
    // This is a simple heuristic - in a real app you might have frequency data
    const commonWords = [
      'HELLO', 'WORLD', 'GAMES', 'PLAYS', 'SMART', 'BRAIN', 'QUICK', 'FAST', 'SLOW', 'EASY',
      'HAPPY', 'SMILE', 'DANCE', 'MUSIC', 'BOOKS', 'STARS', 'OCEAN', 'HOME', 'FOOD', 'WATER'
    ];
    
    return commonWords.includes(normalizedWord);
  }

  // Get difficulty rating for a word
  getWordDifficulty(word) {
    const normalizedWord = word.trim().toUpperCase();
    
    if (!this.isValidWord(normalizedWord)) {
      return 'invalid';
    }

    // Simple difficulty calculation based on word characteristics
    let difficulty = 1; // 1 = easy, 2 = medium, 3 = hard
    
    // Check for uncommon letter combinations
    const uncommonCombos = ['Q', 'X', 'Z', 'J', 'V', 'K'];
    const hasUncommonLetters = uncommonCombos.some(letter => normalizedWord.includes(letter));
    
    if (hasUncommonLetters) {
      difficulty += 1;
    }
    
    // Check for repeated letters
    const letterCounts = {};
    for (const letter of normalizedWord) {
      letterCounts[letter] = (letterCounts[letter] || 0) + 1;
    }
    
    const hasRepeatedLetters = Object.values(letterCounts).some(count => count > 1);
    if (hasRepeatedLetters) {
      difficulty += 1;
    }
    
    // Check if it's a common word
    if (this.isCommonWord(normalizedWord)) {
      difficulty = Math.max(1, difficulty - 1);
    }
    
    return Math.min(3, difficulty);
  }

  // Reload words from file (useful for development)
  reloadWords() {
    this.loadWords();
    logger.info('Word dictionary reloaded');
  }

  // Get words by difficulty
  getWordsByDifficulty(difficulty) {
    return this.words.filter(word => this.getWordDifficulty(word) === difficulty);
  }

  // Search words with pattern matching
  searchWords(pattern, maxResults = 10) {
    if (!pattern || typeof pattern !== 'string') {
      return [];
    }

    const normalizedPattern = pattern.trim().toUpperCase();
    
    // Convert pattern to regex (simple implementation)
    const regexPattern = normalizedPattern
      .replace(/[A-Z]/g, '.') // Replace letters with dots
      .replace(/\./g, '[A-Z]'); // Convert dots to regex
    
    const regex = new RegExp(`^${regexPattern}$`);
    
    return this.words
      .filter(word => regex.test(word))
      .slice(0, maxResults);
  }
}

module.exports = new WordValidator();
