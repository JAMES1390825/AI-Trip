export function randomUserId(): string {
  return `ios-user-${Math.random().toString(36).slice(2, 10)}`;
}
