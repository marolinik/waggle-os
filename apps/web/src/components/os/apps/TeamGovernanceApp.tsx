import { Shield, Lock, Users, Crown } from 'lucide-react';

const TeamGovernanceApp = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="relative mb-4">
        <Shield className="w-12 h-12 text-muted-foreground/20" />
        <Lock className="w-5 h-5 text-primary absolute -bottom-1 -right-1" />
      </div>
      <h2 className="text-lg font-display font-semibold text-foreground mb-2">Team Governance</h2>
      <p className="text-sm text-muted-foreground max-w-xs mb-4">
        Fine-grained permissions, role-based access, and audit controls for your team.
      </p>
      <div className="space-y-2 text-left w-full max-w-xs">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border/30">
          <Users className="w-4 h-4 text-sky-400 shrink-0" />
          <div>
            <p className="text-xs font-display text-foreground">Role-Based Access</p>
            <p className="text-[11px] text-muted-foreground">Owner, Admin, Member, Viewer</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border/30">
          <Shield className="w-4 h-4 text-amber-400 shrink-0" />
          <div>
            <p className="text-xs font-display text-foreground">Tool Governance</p>
            <p className="text-[11px] text-muted-foreground">Per-role tool allow/deny lists</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border/30">
          <Crown className="w-4 h-4 text-violet-400 shrink-0" />
          <div>
            <p className="text-xs font-display text-foreground">Audit Trail</p>
            <p className="text-[11px] text-muted-foreground">Full action history per member</p>
          </div>
        </div>
      </div>
      <div className="mt-6 px-4 py-2 rounded-xl bg-primary/10 border border-primary/30">
        <p className="text-xs font-display text-primary">Available on Teams ($49/mo per seat) and Enterprise tiers</p>
      </div>
    </div>
  );
};

export default TeamGovernanceApp;
