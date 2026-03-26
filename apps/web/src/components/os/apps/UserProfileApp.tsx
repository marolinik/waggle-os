import { useState, useEffect } from 'react';
import {
  User, PenLine, Palette, Heart, Save, Loader2, Search,
  Upload, Sparkles, CheckCircle2, Globe, Clock, MessageSquare,
  FileText, Presentation, FileSpreadsheet, FileDown,
} from 'lucide-react';
import { adapter } from '@/lib/adapter';

type ProfileTab = 'identity' | 'style' | 'brand' | 'interests';

const tabs: { id: ProfileTab; label: string; icon: React.ElementType }[] = [
  { id: 'identity', label: 'Identity', icon: User },
  { id: 'style', label: 'Writing Style', icon: PenLine },
  { id: 'brand', label: 'Brand & Templates', icon: Palette },
  { id: 'interests', label: 'Interests', icon: Heart },
];

const INTEREST_OPTIONS = [
  'Technology', 'Finance', 'Design', 'Marketing', 'Legal',
  'Research', 'Engineering', 'Sales', 'Operations', 'Strategy',
  'Data Science', 'Product Management', 'Healthcare', 'Education',
];

const INDUSTRIES = [
  'Technology', 'Financial Services', 'Consulting', 'Healthcare',
  'Education', 'Manufacturing', 'Retail', 'Media', 'Legal',
  'Real Estate', 'Energy', 'Government', 'Non-profit', 'Other',
];

const UserProfileApp = () => {
  const [tab, setTab] = useState<ProfileTab>('identity');
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [researching, setResearching] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');
  const [industry, setIndustry] = useState('');
  const [bio, setBio] = useState('');
  const [commStyle, setCommStyle] = useState('balanced');
  const [language, setLanguage] = useState('en');
  const [interests, setInterests] = useState<string[]>([]);

  // Style
  const [styleSample, setStyleSample] = useState('');

  // Brand
  const [primaryColor, setPrimaryColor] = useState('#D4A84B');
  const [secondaryColor, setSecondaryColor] = useState('#1a1a1a');
  const [accentColor, setAccentColor] = useState('#3b82f6');
  const [fontHeading, setFontHeading] = useState('Inter');
  const [fontBody, setFontBody] = useState('Inter');
  const [brandDesc, setBrandDesc] = useState('');

  useEffect(() => {
    adapter.getProfile().then((p: any) => {
      setProfile(p);
      setName(p.name ?? '');
      setRole(p.role ?? '');
      setCompany(p.company ?? '');
      setIndustry(p.industry ?? '');
      setBio(p.bio ?? '');
      setCommStyle(p.communicationStyle ?? 'balanced');
      setLanguage(p.language ?? 'en');
      setInterests(p.interests ?? []);
      setPrimaryColor(p.brand?.primaryColor ?? '#D4A84B');
      setSecondaryColor(p.brand?.secondaryColor ?? '#1a1a1a');
      setAccentColor(p.brand?.accentColor ?? '#3b82f6');
      setFontHeading(p.brand?.fontHeading ?? 'Inter');
      setFontBody(p.brand?.fontBody ?? 'Inter');
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await adapter.updateProfile({
        name, role, company, industry, bio,
        communicationStyle: commStyle, language, interests,
        questionnaireCompleted: true,
        brand: { primaryColor, secondaryColor, accentColor, fontHeading, fontBody },
      });
      setSaveMsg('Saved');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch { setSaveMsg('Failed'); }
    finally { setSaving(false); }
  };

  const handleAnalyzeStyle = async () => {
    if (styleSample.length < 50) return;
    setAnalyzing(true);
    try {
      const result = await adapter.analyzeWritingStyle(styleSample);
      setProfile((prev: any) => ({ ...prev, writingStyle: result.writingStyle }));
      setSaveMsg('Style analyzed');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch { setSaveMsg('Analysis failed'); }
    finally { setAnalyzing(false); }
  };

  const handleAnalyzeBrand = async () => {
    if (!brandDesc) return;
    setAnalyzing(true);
    try {
      const result = await adapter.analyzeBrand(brandDesc);
      const b = result.brand;
      if (b.primaryColor) setPrimaryColor(b.primaryColor);
      if (b.secondaryColor) setSecondaryColor(b.secondaryColor);
      if (b.accentColor) setAccentColor(b.accentColor);
      if (b.fontHeading) setFontHeading(b.fontHeading);
      if (b.fontBody) setFontBody(b.fontBody);
      setProfile((prev: any) => ({ ...prev, brand: b }));
      setSaveMsg('Brand extracted');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch { setSaveMsg('Extraction failed'); }
    finally { setAnalyzing(false); }
  };

  const handleResearch = async () => {
    setResearching(true);
    try {
      const result = await adapter.researchProfile();
      if (result.bio) setBio(result.bio);
      setSaveMsg('Research complete');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch { setSaveMsg('Research failed'); }
    finally { setResearching(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  const ws = profile?.writingStyle;

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-36 border-r border-border/50 p-2 space-y-0.5 shrink-0">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
              tab === t.id ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
        {profile?.questionnaireCompleted && (
          <div className="mt-3 pt-3 border-t border-border/30 px-2">
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
              <CheckCircle2 className="w-3 h-3" /> Profile set up
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-auto">

        {/* ═══ IDENTITY ═══ */}
        {tab === 'identity' && (
          <div className="space-y-4 max-w-lg">
            <h3 className="text-sm font-display font-semibold text-foreground">Who Are You?</h3>
            <p className="text-[10px] text-muted-foreground">This helps the agent personalize responses and remember you across workspaces.</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Marko Markovic"
                  className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Role</label>
                <input value={role} onChange={e => setRole(e.target.value)} placeholder="Partner, Strategy Consultant"
                  className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Company</label>
                <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Egzakta Advisory"
                  className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Industry</label>
                <select value={industry} onChange={e => setIndustry(e.target.value)}
                  className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none">
                  <option value="">Select...</option>
                  {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">Bio</label>
              <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} placeholder="Brief professional bio..."
                className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground outline-none resize-none focus:border-primary/50" />
            </div>

            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
              </button>
              <button onClick={handleResearch} disabled={researching || (!name && !company)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-secondary text-foreground hover:bg-secondary/70 disabled:opacity-50 transition-colors">
                {researching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />} Research Me
              </button>
            </div>
          </div>
        )}

        {/* ═══ WRITING STYLE ═══ */}
        {tab === 'style' && (
          <div className="space-y-4 max-w-lg">
            <h3 className="text-sm font-display font-semibold text-foreground">Writing Style</h3>
            <p className="text-[10px] text-muted-foreground">Paste a sample of your writing (email, report, article) and the AI will analyze your style. This shapes how the agent writes for you.</p>

            <textarea value={styleSample} onChange={e => setStyleSample(e.target.value)} rows={6}
              placeholder="Paste at least 50 characters of your writing here... An email, report excerpt, article paragraph, or any text that represents how you naturally write."
              className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground outline-none resize-none focus:border-primary/50" />

            <button onClick={handleAnalyzeStyle} disabled={analyzing || styleSample.length < 50}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors">
              {analyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Analyze Style
            </button>

            {ws?.analyzed && (
              <div className="p-3 rounded-xl bg-secondary/30 border border-border/30 space-y-2">
                <h4 className="text-xs font-display font-semibold text-foreground">Your Style Profile</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Tone:</span> <span className="text-foreground capitalize">{ws.tone}</span></div>
                  <div><span className="text-muted-foreground">Sentences:</span> <span className="text-foreground capitalize">{ws.sentenceLength}</span></div>
                  <div><span className="text-muted-foreground">Vocabulary:</span> <span className="text-foreground capitalize">{ws.vocabulary}</span></div>
                  <div><span className="text-muted-foreground">Structure:</span> <span className="text-foreground capitalize">{ws.structure}</span></div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">The agent will match this style when drafting content for you.</p>
              </div>
            )}

            <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
              <h4 className="text-xs font-display font-semibold text-foreground mb-2">Communication Preference</h4>
              <div className="flex gap-2">
                {['brief', 'balanced', 'detailed'].map(s => (
                  <button key={s} onClick={() => { setCommStyle(s); handleSave(); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-display transition-colors ${
                      commStyle === s ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                    }`}>
                    {s === 'brief' ? '⚡ Brief' : s === 'balanced' ? '⚖️ Balanced' : '📝 Detailed'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ BRAND & TEMPLATES ═══ */}
        {tab === 'brand' && (
          <div className="space-y-4 max-w-lg">
            <h3 className="text-sm font-display font-semibold text-foreground">Brand & Document Templates</h3>
            <p className="text-[10px] text-muted-foreground">Define your brand colors and fonts. These are applied when the agent generates documents.</p>

            {/* Color pickers */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Primary</label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-8 h-8 rounded border-0 cursor-pointer" />
                  <input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                    className="flex-1 bg-muted/50 border border-border/50 rounded-lg px-2 py-1 text-xs text-foreground outline-none font-mono" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Secondary</label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="w-8 h-8 rounded border-0 cursor-pointer" />
                  <input value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)}
                    className="flex-1 bg-muted/50 border border-border/50 rounded-lg px-2 py-1 text-xs text-foreground outline-none font-mono" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Accent</label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} className="w-8 h-8 rounded border-0 cursor-pointer" />
                  <input value={accentColor} onChange={e => setAccentColor(e.target.value)}
                    className="flex-1 bg-muted/50 border border-border/50 rounded-lg px-2 py-1 text-xs text-foreground outline-none font-mono" />
                </div>
              </div>
            </div>

            {/* Fonts */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Heading Font</label>
                <input value={fontHeading} onChange={e => setFontHeading(e.target.value)} placeholder="Inter"
                  className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Body Font</label>
                <input value={fontBody} onChange={e => setFontBody(e.target.value)} placeholder="Inter"
                  className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none" />
              </div>
            </div>

            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save Brand
            </button>

            {/* AI extraction */}
            <div className="border-t border-border/30 pt-4">
              <h4 className="text-xs font-display font-semibold text-foreground mb-2">Auto-Extract from Brand Guide</h4>
              <textarea value={brandDesc} onChange={e => setBrandDesc(e.target.value)} rows={3}
                placeholder="Paste your brand guidelines text here, or describe your brand (colors, fonts, style)..."
                className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-2 text-xs text-foreground outline-none resize-none" />
              <button onClick={handleAnalyzeBrand} disabled={analyzing || !brandDesc}
                className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-secondary text-foreground hover:bg-secondary/70 disabled:opacity-50 transition-colors">
                {analyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Extract Brand
              </button>
            </div>

            {/* Document template previews */}
            <div className="border-t border-border/30 pt-4">
              <h4 className="text-xs font-display font-semibold text-foreground mb-2">Document Style Previews</h4>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: FileText, label: 'Word (docx)', desc: `${fontHeading} headings, ${fontBody} body` },
                  { icon: Presentation, label: 'PowerPoint (pptx)', desc: `${primaryColor} theme` },
                  { icon: FileDown, label: 'PDF Reports', desc: 'Professional layout' },
                  { icon: FileSpreadsheet, label: 'Excel (xlsx)', desc: 'Brand-colored charts' },
                ].map(d => (
                  <div key={d.label} className="p-2.5 rounded-lg bg-secondary/30 border border-border/30">
                    <div className="flex items-center gap-1.5 mb-1">
                      <d.icon className="w-3 h-3 text-primary" />
                      <span className="text-[11px] font-display font-medium text-foreground">{d.label}</span>
                    </div>
                    <p className="text-[9px] text-muted-foreground">{d.desc}</p>
                    <div className="flex gap-1 mt-1.5">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: primaryColor }} />
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: secondaryColor }} />
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: accentColor }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ INTERESTS ═══ */}
        {tab === 'interests' && (
          <div className="space-y-4 max-w-lg">
            <h3 className="text-sm font-display font-semibold text-foreground">Interests & Preferences</h3>
            <p className="text-[10px] text-muted-foreground">Select topics you work with. The agent uses these to prioritize relevant information.</p>

            <div className="flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map(i => (
                <button key={i} onClick={() => setInterests(prev =>
                  prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
                )}
                  className={`px-3 py-1.5 rounded-lg text-xs font-display transition-colors ${
                    interests.includes(i) ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                  }`}>
                  {i}
                </button>
              ))}
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">Language</label>
              <select value={language} onChange={e => setLanguage(e.target.value)}
                className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none">
                <option value="en">English</option>
                <option value="sr">Serbian</option>
                <option value="de">German</option>
                <option value="fr">French</option>
                <option value="es">Spanish</option>
                <option value="zh">Chinese</option>
                <option value="ja">Japanese</option>
              </select>
            </div>

            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save Preferences
            </button>
          </div>
        )}

        {saveMsg && (
          <div className="mt-3 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 inline-block">
            {saveMsg}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserProfileApp;
