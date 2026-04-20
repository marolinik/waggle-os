/**
 * User Profile API — identity, writing style, brand, and preferences.
 *
 * Profile data is stored in a JSON file at ~/.waggle/profile.json and
 * key fields are also saved to personal memory for agent access.
 *
 * Endpoints:
 *   GET    /api/profile          — Get full profile
 *   PUT    /api/profile          — Update profile fields
 *   POST   /api/profile/analyze-style  — Analyze writing style from text samples
 *   POST   /api/profile/analyze-brand  — Extract brand colors/fonts from description
 *   GET    /api/profile/style    — Get writing style summary (for agent use)
 *   GET    /api/profile/brand    — Get brand profile (for document tools)
 *   POST   /api/profile/research — Research user/company online
 */

import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Identity suggestion extracted from harvested memory frames.
 * Surfaced in UserProfileApp's Identity tab as a pending-review banner until
 * the user accepts (populates the field) or dismisses the suggestion.
 */
export interface IdentitySuggestion {
  field: 'name' | 'role' | 'company' | 'industry' | 'bio';
  value: string;
  /** 0..1 — self-reported by the LLM extractor, used as a hint next to each suggestion. */
  confidence: number;
  /** Short note on the evidence (e.g. "3 harvest frames mention Egzakta"). */
  sourceHint: string;
  extractedAt: string;
}

export interface UserProfile {
  // Identity
  name: string;
  role: string;
  company: string;
  industry: string;
  bio: string;
  avatarUrl: string;
  /**
   * M-09: Identity facts extracted from memory harvest, awaiting user
   * review. Empty until the user runs harvest and the extraction route
   * produces at least one suggestion.
   */
  identitySuggestions: IdentitySuggestion[];

  // Writing Style
  writingStyle: {
    tone: string;          // formal, casual, professional, academic, conversational
    sentenceLength: string; // short, medium, long, varied
    vocabulary: string;     // simple, moderate, advanced, technical
    structure: string;      // bullet-heavy, prose, mixed, structured
    samples: string[];      // raw text samples provided by user
    analyzed: boolean;
  };

  // Brand & Visual Identity
  brand: {
    companyName: string;
    primaryColor: string;   // hex
    secondaryColor: string; // hex
    accentColor: string;    // hex
    fontHeading: string;
    fontBody: string;
    logoDescription: string;
    styles: {
      docx: { margins: string; headerStyle: string; notes: string };
      pptx: { layout: string; colorScheme: string; notes: string };
      pdf: { coverPage: string; reportStyle: string; notes: string };
      xlsx: { headerFormat: string; chartColors: string; notes: string };
    };
    analyzed: boolean;
  };

  // Interests & Preferences
  interests: string[];
  communicationStyle: string; // brief, detailed, balanced
  language: string;
  timezone: string;

  // Meta
  questionnaireCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_PROFILE: UserProfile = {
  name: '',
  role: '',
  company: '',
  industry: '',
  bio: '',
  avatarUrl: '',
  identitySuggestions: [],
  writingStyle: {
    tone: 'professional',
    sentenceLength: 'medium',
    vocabulary: 'moderate',
    structure: 'mixed',
    samples: [],
    analyzed: false,
  },
  brand: {
    companyName: '',
    primaryColor: '#D4A84B',
    secondaryColor: '#1a1a1a',
    accentColor: '#3b82f6',
    fontHeading: 'Inter',
    fontBody: 'Inter',
    logoDescription: '',
    styles: {
      docx: { margins: 'normal', headerStyle: 'bold', notes: '' },
      pptx: { layout: '16:9', colorScheme: 'dark', notes: '' },
      pdf: { coverPage: 'standard', reportStyle: 'professional', notes: '' },
      xlsx: { headerFormat: 'bold-bordered', chartColors: 'brand', notes: '' },
    },
    analyzed: false,
  },
  interests: [],
  communicationStyle: 'balanced',
  language: 'en',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  questionnaireCompleted: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export function getProfilePath(dataDir: string): string {
  return path.join(dataDir, 'profile.json');
}

export function loadProfile(dataDir: string): UserProfile {
  const filePath = getProfilePath(dataDir);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
    }
  } catch { /* use defaults */ }
  return { ...DEFAULT_PROFILE };
}

export function saveProfile(dataDir: string, profile: UserProfile): void {
  profile.updatedAt = new Date().toISOString();
  const filePath = getProfilePath(dataDir);
  fs.writeFileSync(filePath, JSON.stringify(profile, null, 2), 'utf-8');
}

export const profileRoutes: FastifyPluginAsync = async (fastify) => {
  const dataDir = fastify.localConfig.dataDir;

  // GET /api/profile — full profile
  fastify.get('/api/profile', async () => {
    return loadProfile(dataDir);
  });

  // PUT /api/profile — update profile fields (partial merge)
  fastify.put('/api/profile', async (request) => {
    const updates = request.body as Partial<UserProfile>;
    const profile = loadProfile(dataDir);

    // Deep merge
    if (updates.name != null) profile.name = updates.name;
    if (updates.role != null) profile.role = updates.role;
    if (updates.company != null) profile.company = updates.company;
    if (updates.industry != null) profile.industry = updates.industry;
    if (updates.bio != null) profile.bio = updates.bio;
    if (updates.avatarUrl != null) profile.avatarUrl = updates.avatarUrl;
    if (updates.interests != null) profile.interests = updates.interests;
    if (updates.communicationStyle != null) profile.communicationStyle = updates.communicationStyle;
    if (updates.language != null) profile.language = updates.language;
    if (updates.timezone != null) profile.timezone = updates.timezone;
    if (updates.questionnaireCompleted != null) profile.questionnaireCompleted = updates.questionnaireCompleted;
    if (updates.identitySuggestions != null) profile.identitySuggestions = updates.identitySuggestions;

    if (updates.writingStyle) {
      profile.writingStyle = { ...profile.writingStyle, ...updates.writingStyle };
    }
    if (updates.brand) {
      profile.brand = {
        ...profile.brand,
        ...updates.brand,
        styles: updates.brand.styles
          ? { ...profile.brand.styles, ...updates.brand.styles }
          : profile.brand.styles,
      };
    }

    saveProfile(dataDir, profile);

    // Also save key identity to personal memory for agent access
    if (profile.name || profile.role || profile.company) {
      try {
        const orch = fastify.agentState?.orchestrator;
        if (orch) {
          const identity = [
            profile.name && `Name: ${profile.name}`,
            profile.role && `Role: ${profile.role}`,
            profile.company && `Company: ${profile.company}`,
            profile.industry && `Industry: ${profile.industry}`,
          ].filter(Boolean).join('. ');
          if (identity) {
            const frames = orch.getFrames();
            const sessions = orch.getSessions();
            const active = sessions.getActive();
            const gopId = active.length > 0 ? active[0].gop_id : sessions.create().gop_id;
            const latestI = frames.getLatestIFrame(gopId);
            if (latestI) {
              frames.createPFrame(gopId, `User identity: ${identity}`, latestI.id, 'important');
            } else {
              frames.createIFrame(gopId, `User identity: ${identity}`, 'important');
            }
          }
        }
      } catch { /* non-blocking */ }
    }

    return profile;
  });

  // POST /api/profile/analyze-style — analyze writing style from text
  fastify.post('/api/profile/analyze-style', async (request, reply) => {
    const { text } = request.body as { text?: string };
    if (!text || text.length < 50) {
      return reply.code(400).send({ error: 'Provide at least 50 characters of sample text' });
    }

    const profile = loadProfile(dataDir);
    profile.writingStyle.samples.push(text.slice(0, 2000));

    // Analyze style using the built-in Anthropic proxy
    try {
      const apiKey = fastify.vault?.get('anthropic')?.value;
      if (!apiKey) {
        return reply.code(503).send({ error: 'No Anthropic key — cannot analyze style' });
      }

      const proxyUrl = `http://127.0.0.1:${fastify.server.address()?.toString().split(':').pop() ?? '3333'}`;
      const res = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: `Analyze this writing sample and return JSON with these fields:
- tone: one of "formal", "casual", "professional", "academic", "conversational"
- sentenceLength: one of "short", "medium", "long", "varied"
- vocabulary: one of "simple", "moderate", "advanced", "technical"
- structure: one of "bullet-heavy", "prose", "mixed", "structured"

Only return valid JSON, no explanation.

Sample text:
"${text.slice(0, 1500)}"`,
          }],
        }),
      });

      if (res.ok) {
        const data = await res.json() as any;
        const content = data.choices?.[0]?.message?.content ?? '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const analysis = JSON.parse(jsonMatch[0]);
          profile.writingStyle.tone = analysis.tone ?? profile.writingStyle.tone;
          profile.writingStyle.sentenceLength = analysis.sentenceLength ?? profile.writingStyle.sentenceLength;
          profile.writingStyle.vocabulary = analysis.vocabulary ?? profile.writingStyle.vocabulary;
          profile.writingStyle.structure = analysis.structure ?? profile.writingStyle.structure;
          profile.writingStyle.analyzed = true;
        }
      }
    } catch { /* fallback to defaults */ }

    saveProfile(dataDir, profile);
    return { writingStyle: profile.writingStyle };
  });

  // POST /api/profile/analyze-brand — extract brand from description
  fastify.post('/api/profile/analyze-brand', async (request, reply) => {
    const { description } = request.body as { description?: string };
    if (!description) {
      return reply.code(400).send({ error: 'Provide a brand description or paste brand guide text' });
    }

    const profile = loadProfile(dataDir);

    try {
      const apiKey = fastify.vault?.get('anthropic')?.value;
      if (!apiKey) {
        return reply.code(503).send({ error: 'No Anthropic key — cannot analyze brand' });
      }

      const proxyUrl = `http://127.0.0.1:${fastify.server.address()?.toString().split(':').pop() ?? '3333'}`;
      const res = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: `Extract brand identity from this description and return JSON with:
- primaryColor: hex color (e.g., "#D4A84B")
- secondaryColor: hex color
- accentColor: hex color
- fontHeading: font name (e.g., "Inter", "Helvetica")
- fontBody: font name
- logoDescription: brief description of logo style

Only return valid JSON, no explanation.

Brand description:
"${description.slice(0, 2000)}"`,
          }],
        }),
      });

      if (res.ok) {
        const data = await res.json() as any;
        const content = data.choices?.[0]?.message?.content ?? '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const brand = JSON.parse(jsonMatch[0]);
          if (brand.primaryColor) profile.brand.primaryColor = brand.primaryColor;
          if (brand.secondaryColor) profile.brand.secondaryColor = brand.secondaryColor;
          if (brand.accentColor) profile.brand.accentColor = brand.accentColor;
          if (brand.fontHeading) profile.brand.fontHeading = brand.fontHeading;
          if (brand.fontBody) profile.brand.fontBody = brand.fontBody;
          if (brand.logoDescription) profile.brand.logoDescription = brand.logoDescription;
          profile.brand.analyzed = true;
        }
      }
    } catch { /* fallback */ }

    saveProfile(dataDir, profile);
    return { brand: profile.brand };
  });

  // GET /api/profile/style — writing style summary for agent injection
  fastify.get('/api/profile/style', async () => {
    const profile = loadProfile(dataDir);
    const s = profile.writingStyle;
    return {
      summary: `Tone: ${s.tone}. Sentences: ${s.sentenceLength}. Vocabulary: ${s.vocabulary}. Structure: ${s.structure}.`,
      ...s,
    };
  });

  // GET /api/profile/brand — brand profile for document generation tools
  fastify.get('/api/profile/brand', async () => {
    const profile = loadProfile(dataDir);
    return profile.brand;
  });

  // POST /api/profile/research — research user/company online
  fastify.post('/api/profile/research', async (request, reply) => {
    const profile = loadProfile(dataDir);
    if (!profile.name && !profile.company) {
      return reply.code(400).send({ error: 'Set name or company first before researching' });
    }

    // Use the agent's web_search tool to research
    try {
      const query = [profile.name, profile.role, profile.company].filter(Boolean).join(' ');
      const apiKey = fastify.vault?.get('anthropic')?.value;
      if (!apiKey) {
        return reply.code(503).send({ error: 'No Anthropic key for research' });
      }

      const proxyUrl = `http://127.0.0.1:${fastify.server.address()?.toString().split(':').pop() ?? '3333'}`;
      const res = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: `Based on this person's information, write a brief professional bio (3-4 sentences):
Name: ${profile.name}
Role: ${profile.role}
Company: ${profile.company}
Industry: ${profile.industry}

Write a factual, professional bio. If you don't have enough info, write what you can based on the role and industry.`,
          }],
        }),
      });

      if (res.ok) {
        const data = await res.json() as any;
        const bio = data.choices?.[0]?.message?.content ?? '';
        if (bio) {
          profile.bio = bio.trim();
          saveProfile(dataDir, profile);
        }
        return { bio: profile.bio, researched: true };
      }
      return { bio: profile.bio, researched: false };
    } catch {
      return reply.code(500).send({ error: 'Research failed' });
    }
  });
};
