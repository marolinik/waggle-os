export interface PlanStep {
  title: string;
  command?: string;
  description?: string;
  status: 'pending' | 'done' | 'failed';
  result?: string;
  reason?: string;
}

export class Plan {
  private steps: PlanStep[] = [];
  private currentIndex = 0;

  addStep(step: { title: string; command?: string; description?: string }): void {
    this.steps.push({ ...step, status: 'pending' });
  }

  getSteps(): PlanStep[] {
    return [...this.steps];
  }

  getCurrentStep(): PlanStep | undefined {
    return this.currentIndex < this.steps.length && this.steps[this.currentIndex].status === 'pending'
      ? this.steps[this.currentIndex]
      : undefined;
  }

  completeCurrentStep(result: string): void {
    if (this.currentIndex < this.steps.length) {
      this.steps[this.currentIndex].status = 'done';
      this.steps[this.currentIndex].result = result;
      this.currentIndex++;
    }
  }

  failCurrentStep(reason: string): void {
    if (this.currentIndex < this.steps.length) {
      this.steps[this.currentIndex].status = 'failed';
      this.steps[this.currentIndex].reason = reason;
      this.currentIndex++;
    }
  }

  isComplete(): boolean {
    return this.steps.length > 0 && this.steps.every(s => s.status === 'done');
  }

  toJSON(): object {
    return { steps: this.steps, currentIndex: this.currentIndex };
  }

  static fromJSON(json: { steps: PlanStep[]; currentIndex: number }): Plan {
    const plan = new Plan();
    plan.steps = json.steps;
    plan.currentIndex = json.currentIndex;
    return plan;
  }
}
