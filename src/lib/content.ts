import siteJson from '../data-plain/site.json';
import programsJson from '../data-plain/programs.json';
import sitesJson from '../data-plain/sites.json';
import linksJson from '../data-plain/links.json';
import thumbsJson from '../data/thumbs.json';
import type { Lang, LocaleText } from './i18n';

export type Social = { id: string; label: string; url: string; icon: string };
export type SkillGroup = { group: LocaleText; items: string[] };
export type Fact = { label: LocaleText; value: LocaleText };

export type Site = {
  brand: string;
  name: LocaleText;
  role: LocaleText;
  tagline: LocaleText;
  bio: { ar: string[]; en: string[] };
  availability: LocaleText;
  location: LocaleText;
  email: string;
  formEndpoint: string;
  focus: string[];
  facts: Fact[];
  socials: Social[];
  skills: SkillGroup[];
};

export type Project = {
  id: string;
  name: LocaleText;
  desc: LocaleText;
  url: string;
  repo?: string;
  year: string;
  tags: string[];
  image: string;
  demo?: boolean;
};

export type LinkItem = {
  id: string;
  title: LocaleText;
  desc: LocaleText;
  url: string;
  icon: string;
};

export const site = siteJson as unknown as Site;
export const programs = programsJson as unknown as Project[];
export const sites = sitesJson as unknown as Project[];
export const links = linksJson as unknown as LinkItem[];

/** Auto-generated at build time by scripts/fetch-thumbs.mjs */
export const thumbs = thumbsJson as Record<string, string>;

/** Resolve a card thumbnail: manual image first, then the auto-fetched one. */
export function thumbFor(project: Project): string {
  const raw = project.image?.trim() || thumbs[project.id] || '';
  if (!raw) return '';
  if (/^(https?:)?\/\//.test(raw) || raw.startsWith('/')) return raw;
  return '/' + raw.replace(/^\.?\//, '');
}

/** Pick a localized string, falling back to the other language. */
export function pick(value: LocaleText | string | undefined, lang: Lang): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value[lang] || value[lang === 'ar' ? 'en' : 'ar'] || '';
}

/** Initials for placeholder thumbnails. */
export function initials(name: string): string {
  const clean = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'FZ';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Stable monochrome gradient per id, so placeholders look intentional. */
export function placeholderStyle(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 97;
  const top = 16 + (h % 14);
  const mid = 9 + (h % 6);
  return `--ph-a: hsl(220 7% ${top}%); --ph-b: hsl(220 9% ${mid}%);`;
}

export const activeSocials = site.socials.filter((s) => s.url.trim().length > 0);
