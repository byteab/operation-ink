/** Confirmed-hit feedback with finite recovery; repeated hits stay bounded. */
export class IncomingFire {
  strength = 0
  direction = 'Ahead'
  private remaining = 0

  pulse(intensity: number, direction: string) {
    const weight = Math.max(0, Math.min(1, intensity))
    if (weight <= 0) return
    if (weight >= this.strength * 0.6 || this.remaining < 0.2) this.direction = direction
    this.strength = Math.min(1, Math.max(this.strength, weight) + 0.12 * weight)
    this.remaining = 0.65
  }

  update(dt: number) {
    if (dt <= 0) return
    this.remaining = Math.max(0, this.remaining - dt)
    this.strength = this.remaining > 0 ? this.strength * Math.exp(-dt * 5.5) : 0
  }

  clear() { this.strength = 0; this.remaining = 0; this.direction = 'Ahead' }
  get visible() { return this.remaining > 0 }
}
