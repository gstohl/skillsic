import { writable, derived } from 'svelte/store';
import type { Skill, SortOption, Stats, AnalysisModel, ViewMode } from './types';

// State stores
export const skills = writable<Skill[]>([]);
export const searchQuery = writable('');
export const selectedCategory = writable<string | null>(null);
export const sortBy = writable<SortOption>('installs');
export const isLoading = writable(false);
export const selectedModel = writable<AnalysisModel>('Sonnet');
export const viewMode = writable<ViewMode>('cards');

// Server-side pagination state
export const totalFiltered = writable(0);
export const currentPage = writable(1);

// Canister stats (fetched directly from canister)
export const canisterStats = writable<Stats>({
  total_skills: 0,
  analyzed_skills: 0,
  total_installs: 0,
  total_users: 0,
});

// Filter options
export const showOnlyWithMcp = writable(false);
export const showOnlyAnalyzed = writable(false);

// Categories derived from whatever skills are currently loaded (best-effort)
export const categories = derived(skills, ($skills) => {
  const cats = new Set<string>();
  $skills.forEach((skill) => {
    if (skill.analysis) {
      cats.add(skill.analysis.primary_category);
      skill.analysis.secondary_categories.forEach((cat) => cats.add(cat));
    }
  });
  return Array.from(cats).sort();
});

export const tags = derived(skills, ($skills) => {
  const allTags = new Set<string>();
  $skills.forEach((skill) => {
    if (skill.analysis) {
      skill.analysis.tags.forEach((tag) => allTags.add(tag));
    }
  });
  return Array.from(allTags).sort();
});

export const stats = derived(skills, ($skills): Stats => ({
  total_skills: $skills.length,
  analyzed_skills: $skills.filter((s) => s.analysis !== null).length,
  total_installs: $skills.reduce((sum, s) => sum + Number(s.install_count), 0),
  total_users: 0,
}));

export const skillsWithMcp = derived(skills, ($skills) =>
  $skills.filter((s) => s.analysis?.provides_mcp === true)
);

export const avgRating = derived(skills, ($skills) => {
  const analyzed = $skills.filter((s) => s.analysis !== null);
  if (analyzed.length === 0) return 0;
  return (
    analyzed.reduce((sum, s) => sum + (s.analysis?.ratings.overall ?? 0), 0) / analyzed.length
  );
});
