import analyticsAvatar from '@/assets/personas/analytics.jpeg';
import contentWriterAvatar from '@/assets/personas/content-writer.jpeg';
import forecasterAvatar from '@/assets/personas/forecaster.jpeg';
import hookAnalyzerAvatar from '@/assets/personas/hook-analyzer.jpeg';
import publisherAvatar from '@/assets/personas/publisher.jpeg';
import researcherAvatar from '@/assets/personas/researcher.jpeg';
import synthesizerAvatar from '@/assets/personas/synthesizer.jpeg';
import trendDetectorAvatar from '@/assets/personas/trend-detector.jpeg';

export interface PersonaConfig {
  id: string;
  name: string;
  description: string;
  avatar: string;
  role: string;
}

export const PERSONAS: PersonaConfig[] = [
  { id: 'analytics', name: 'Analytics Bee', description: 'Data analysis & insights', avatar: analyticsAvatar, role: 'analyst' },
  { id: 'content-writer', name: 'Scribe Bee', description: 'Content creation & writing', avatar: contentWriterAvatar, role: 'writer' },
  { id: 'forecaster', name: 'Oracle Bee', description: 'Predictions & forecasting', avatar: forecasterAvatar, role: 'forecaster' },
  { id: 'hook-analyzer', name: 'Hunter Bee', description: 'Pattern detection & hooks', avatar: hookAnalyzerAvatar, role: 'analyzer' },
  { id: 'publisher', name: 'Herald Bee', description: 'Publishing & distribution', avatar: publisherAvatar, role: 'publisher' },
  { id: 'researcher', name: 'Scholar Bee', description: 'Deep research & investigation', avatar: researcherAvatar, role: 'researcher' },
  { id: 'synthesizer', name: 'Alchemist Bee', description: 'Information synthesis', avatar: synthesizerAvatar, role: 'synthesizer' },
  { id: 'trend-detector', name: 'Scout Bee', description: 'Trend detection & signals', avatar: trendDetectorAvatar, role: 'scout' },
];

export const getPersonaById = (id: string) => PERSONAS.find(p => p.id === id);
export const getPersonaAvatar = (id: string) => getPersonaById(id)?.avatar;
