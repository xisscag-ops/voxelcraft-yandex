// Плавный разгон тряски камеры после длительного непрерывного бега.
export function updateRunShake(state, running, dt) {
  if (running) state.duration += Math.max(0, dt);
  else state.duration = 0;

  const target = running
    ? Math.max(0, Math.min(1, (state.duration - 2) / 3))
    : 0;
  const response = running ? 4.2 : 6.5;
  state.strength += (target - state.strength) * (1 - Math.exp(-response * Math.max(0, dt)));
  state.strength = Math.max(0, Math.min(1, state.strength));
  return state.strength;
}
