// Persistent cache using localStorage + in-memory for skill data

const STORAGE_KEY = 'skillsic_cache';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface CacheStore {
  [key: string]: CacheEntry<any>;
}

class SkillCache {
  private cache: CacheStore = {};
  
  // TTL in milliseconds
  private readonly SKILL_TTL = 10 * 60 * 1000;     // 10 minutes for individual skills
  private readonly LIST_TTL = 5 * 60 * 1000;       // 5 minutes for skill lists (frontpage)
  private readonly SEARCH_TTL = 2 * 60 * 1000;     // 2 minutes for search results
  
  constructor() {
    this.loadFromStorage();
  }
  
  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.cache = JSON.parse(stored);
        // Clean up expired entries on load
        this.cleanup();
      }
    } catch (e) {
      console.warn('Failed to load cache from localStorage:', e);
      this.cache = {};
    }
  }
  
  private saveToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.cache));
    } catch (e) {
      // Storage might be full, clear old entries
      console.warn('Failed to save cache to localStorage:', e);
      this.cleanup();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.cache));
      } catch {
        // Give up
      }
    }
  }
  
  private isExpired(entry: CacheEntry<any>, ttl: number): boolean {
    return Date.now() - entry.timestamp > ttl;
  }
  
  // Individual skill cache
  getSkill(id: string): any | null {
    const key = `skill:${id}`;
    const entry = this.cache[key];
    if (entry && !this.isExpired(entry, this.SKILL_TTL)) {
      return entry.data;
    }
    return null;
  }
  
  setSkill(id: string, data: any): void {
    const key = `skill:${id}`;
    this.cache[key] = { data, timestamp: Date.now() };
    this.saveToStorage();
  }
  
  // Invalidate a skill (e.g., after analysis)
  invalidateSkill(id: string): void {
    delete this.cache[`skill:${id}`];
    this.saveToStorage();
  }
  
  // Skills list cache (paginated) - this is the frontpage data
  getSkillsList(key: string): any | null {
    const cacheKey = `list:${key}`;
    const entry = this.cache[cacheKey];
    if (entry && !this.isExpired(entry, this.LIST_TTL)) {
      return entry.data;
    }
    return null;
  }
  
  setSkillsList(key: string, data: any): void {
    const cacheKey = `list:${key}`;
    this.cache[cacheKey] = { data, timestamp: Date.now() };
    this.saveToStorage();
  }
  
  // Search results cache
  getSearch(query: string): any | null {
    const key = `search:${query.toLowerCase().trim()}`;
    const entry = this.cache[key];
    if (entry && !this.isExpired(entry, this.SEARCH_TTL)) {
      return entry.data;
    }
    return null;
  }
  
  setSearch(query: string, data: any): void {
    const key = `search:${query.toLowerCase().trim()}`;
    this.cache[key] = { data, timestamp: Date.now() };
    this.saveToStorage();
  }
  
  // Clear all caches
  clear(): void {
    this.cache = {};
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  
  // Clear expired entries
  cleanup(): void {
    const now = Date.now();
    let changed = false;
    
    for (const key of Object.keys(this.cache)) {
      const entry = this.cache[key];
      let ttl = this.SKILL_TTL;
      if (key.startsWith('list:')) ttl = this.LIST_TTL;
      if (key.startsWith('search:')) ttl = this.SEARCH_TTL;
      
      if (now - entry.timestamp > ttl) {
        delete this.cache[key];
        changed = true;
      }
    }
    
    if (changed) {
      this.saveToStorage();
    }
  }
  
  // Get cache stats for debugging
  stats(): { size: number; keys: string[] } {
    return {
      size: Object.keys(this.cache).length,
      keys: Object.keys(this.cache),
    };
  }
}

// Singleton instance
export const skillCache = new SkillCache();

// Cleanup every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(() => skillCache.cleanup(), 5 * 60 * 1000);
}
